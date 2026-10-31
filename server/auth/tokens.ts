import type { Context, MiddlewareHandler } from "hono";
import { and, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { config } from "../config";
import { db, schema } from "../db";
import { ownerOnlyScopes, type Role, type Scope } from "../db/schema";
import { randomToken, sha256 } from "../lib/crypto";
import { newId } from "../lib/ids";
import { forbidden, tooMany, unauthorised } from "../lib/errors";
import { hit } from "../lib/ratelimit";
import { clientIp, type AppEnv } from "../http";
import { requireUser } from "./session";

/**
 * Account tokens authenticate the management API for things that have no
 * browser: the MCP server, the CLI and CI. They are organisation-wide,
 * carry scopes, and never give more than their owner's role allows.
 */

export const TOKEN_PREFIX = "ak_live_";

export const newAccessTokenSecret = () => `${TOKEN_PREFIX}${randomToken(24).replace(/[-_]/g, "").slice(0, 32)}`;
/** The visible start of a token, enough to tell two of them apart. */
export const tokenPrefix = (secret: string) => secret.slice(0, TOKEN_PREFIX.length + 4);

export type TokenAuth = {
  id: string;
  scopes: Scope[];
  /** Null means every project in the organisation. */
  projectIds: string[] | null;
};

/* ------------------------------------------------------------ authentication */

/**
 * Accepts either an account token or a dashboard session. A bearer token is
 * exempt from the cross-site check `requireUser` applies, because there is
 * no cookie for another site to ride.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = bearer(c);
  if (!secret) {
    c.set("via", "session");
    return requireUser(c, next);
  }

  const [row] = await db
    .select({ token: schema.accessTokens, user: schema.users })
    .from(schema.accessTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessTokens.userId))
    .where(
      and(
        eq(schema.accessTokens.tokenHash, sha256(secret)),
        isNull(schema.accessTokens.revokedAt),
        or(isNull(schema.accessTokens.expiresAt), gt(schema.accessTokens.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!row) throw unauthorised("That token isn't valid. It may have been revoked or have expired.");

  const limit = hit({ key: `token:${row.token.id}`, max: config.limits.tokenRequestsPerMinute, windowMs: 60_000 });
  if (!limit.ok) throw tooMany(`This token is making too many requests. Try again in ${limit.retryAfter} seconds.`);

  // The role is read fresh every time, so demoting someone narrows their
  // tokens at once and removing them kills them outright.
  const [member] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, row.token.orgId), eq(schema.memberships.userId, row.token.userId)))
    .limit(1);
  if (!member) throw forbidden("The person this token belongs to is no longer a member of that organisation.");

  if (Date.now() - (row.token.lastUsedAt?.getTime() ?? 0) > 60_000) {
    await db.update(schema.accessTokens).set({ lastUsedAt: new Date(), lastUsedIp: callerIp(c) }).where(eq(schema.accessTokens.id, row.token.id));
  }

  c.set("user", row.user);
  c.set("via", "token");
  c.set("role", member.role);
  c.set("orgId", row.token.orgId);
  c.set("token", { id: row.token.id, scopes: effectiveScopes(member.role, row.token.scopes), projectIds: row.token.projectIds ?? null });
  await next();
};

/** The caller's address, or null when there isn't one to record. */
function callerIp(c: Context): string | null {
  const ip = clientIp(c).slice(0, 64);
  return ip === "unknown" ? null : ip;
}

function bearer(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  return match[1].startsWith(TOKEN_PREFIX) ? match[1] : null;
}

/** A member's token can never act as an owner, whatever it was granted. */
const effectiveScopes = (role: Role, granted: Scope[]): Scope[] => (role === "owner" ? granted : granted.filter((s) => !ownerOnlyScopes.includes(s)));

/**
 * Resolves the organisation in the path. `current` means "the one this token
 * belongs to", so a client never has to learn an id first.
 *
 * The organisation row itself is loaded as well, because what it is allowed
 * to do depends on its plan and nearly every route needs to know.
 */
export const resolveOrg: MiddlewareHandler<AppEnv> = async (c, next) => {
  const param = c.req.param("org");
  const token = c.get("token");

  if (param === "current") {
    if (token) return withOrg(c, next); // requireAuth already set the org
    const rows = await db
      .select({ orgId: schema.memberships.orgId, role: schema.memberships.role })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, c.get("user").id))
      .orderBy(schema.memberships.createdAt);
    if (!rows.length) throw forbidden("You aren't a member of any organisation.");
    if (rows.length > 1) throw forbidden("You belong to more than one organisation, so name the one you mean instead of 'current'.");
    c.set("orgId", rows[0].orgId);
    c.set("role", rows[0].role);
    return withOrg(c, next);
  }

  if (!param) throw forbidden();
  if (token) {
    if (param !== c.get("orgId")) throw forbidden("This token belongs to a different organisation.");
    return withOrg(c, next);
  }

  const [m] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, param), eq(schema.memberships.userId, c.get("user").id)))
    .limit(1);
  if (!m) throw forbidden("You aren't a member of this organisation.");
  c.set("orgId", param);
  c.set("role", m.role);
  await withOrg(c, next);
};

async function withOrg(c: Context<AppEnv>, next: () => Promise<void>) {
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, c.get("orgId")) });
  if (!org) throw forbidden("That organisation no longer exists.");
  c.set("org", org);
  await next();
}

/* ------------------------------------------------------------------- scopes */

type Rule = {
  match: RegExp;
  /** Scope needed for GET and HEAD. Null means authentication is enough. */
  read?: Scope | null;
  /**
   * Scope needed for anything that changes state. Undefined means refuse,
   * "session" means only a person in the dashboard may do it.
   */
  write?: Scope | null | "session";
  /** Endpoints no token may reach, only a signed-in person in the dashboard. */
  session?: true;
};

/**
 * What each part of the management API needs. First match wins, and anything
 * unmatched is refused, so a new endpoint is closed to tokens until someone
 * decides what it costs.
 */
const rules: Rule[] = [
  { match: /^\/whoami$/, read: null },
  // Minting or revoking tokens from a token would let one outlive its owner's
  // intent, so it stays a thing you do in the dashboard.
  { match: /^\/tokens(\/|$)/, session: true },
  { match: /^\/audit(\/|$)/, read: "org:read" },
  // What the organisation is paying for is readable; changing it means a card,
  // so it happens in the dashboard.
  { match: /^\/billing(\/|$)/, read: "org:read", write: "session" },
  // Somebody's own email preferences aren't a token's business.
  { match: /^\/notifications(\/|$)/, session: true },
  // Where a new install has got to, and the test report that proves it works.
  { match: /^\/onboarding(\/|$)/, read: "org:read", write: "reports:write" },
  { match: /^\/projects\/[^/]+\/keys(\/|$)/, read: "projects:read", write: "keys:write" },
  { match: /^\/projects\/[^/]+\/destinations(\/|$)/, read: "destinations:read", write: "destinations:write" },
  // Releases and their source maps belong to the build, so they follow the project.
  { match: /^\/projects\/[^/]+\/releases(\/|$)/, read: "projects:read", write: "projects:write" },
  // A project as a file: reading it is reading the project, applying it can
  // add destinations, so it costs both.
  { match: /^\/projects\/[^/]+\/config(\/|$)/, read: "projects:read", write: "destinations:write" },
  // Trying rules out changes nothing, whatever the method says.
  { match: /^\/projects\/[^/]+\/rules(\/|$)/, read: "projects:read", write: "projects:read" },
  { match: /^\/projects(\/|$)/, read: "projects:read", write: "projects:write" },
  { match: /^\/reports(\/|$)/, read: "reports:read", write: "reports:write" },
  { match: /^\/attachments(\/|$)/, read: "reports:read" },
  // Listing a connection's repositories or checking it still works reads it.
  { match: /^\/connections\/[^/]+\/(targets|validate)$/, read: "connections:read", write: "connections:read" },
  { match: /^\/connections(\/|$)/, read: "connections:read", write: "connections:write" },
  { match: /^\/deliveries(\/|$)/, read: "deliveries:read", write: "deliveries:write" },
  { match: /^\/destinations(\/|$)/, read: "destinations:read", write: "destinations:write" },
  { match: /^\/delivery-policy(\/|$)/, read: "org:read", write: "org:write" },
  { match: /^\/analytics(\/|$)/, read: "analytics:read" },
  // Whether the pipeline is keeping up: the thing you point an alert at.
  { match: /^\/health(\/|$)/, read: "analytics:read" },
  { match: /^\/usage(\/|$)/, read: "analytics:read" },
  { match: /^\/events(\/|$)/, read: "reports:read" },
  { match: /^\/members(\/|$)/, read: "org:read", write: "org:write" },
  { match: /^\/invitations(\/|$)/, read: "org:read", write: "org:write" },
  // Someone's own dashboard layout, not organisation settings.
  { match: /^\/preferences$/, read: "org:read", write: "org:read" },
  { match: /^\/?$/, read: "org:read", write: "org:write" },
];

/** Endpoints that describe the whole organisation, so a fenced token can't use them. */
const orgWide = [/^\/usage(\/|$)/, /^\/events(\/|$)/];
/** Endpoints a fenced token may only use for one project at a time. */
const needsProjectQuery = [/^\/analytics(\/|$)/];

/** The part of the path below /api/orgs/{org}. */
export function subPath(c: Context): string {
  const path = new URL(c.req.url).pathname;
  return path.replace(/^\/api\/orgs\/[^/]+/, "") || "/";
}

/**
 * What this request costs a token: a scope, null when authentication alone is
 * enough, "session" when no token may do it, or "closed" when nothing covers
 * it. The API reference reads the same answer, so the documented scope and
 * the enforced one cannot drift apart.
 */
export function scopeFor(method: string, path: string): Scope | null | "session" | "closed" {
  const rule = rules.find((r) => r.match.test(path));
  if (!rule) return "closed";
  if (rule.session) return "session";
  const needed = method === "GET" || method === "HEAD" ? rule.read : rule.write;
  return needed === undefined ? "closed" : needed;
}

/**
 * Whether a token may make this request. Pure, so the rules can be read and
 * tested on their own rather than inferred from a stack of middleware.
 */
export function scopeCheck(req: { method: string; path: string; scopes: Scope[]; projectIds: string[] | null; project?: string | null }): string | null {
  const needed = scopeFor(req.method, req.path);
  if (needed === "closed") return rules.some((r) => r.match.test(req.path)) ? "Tokens can't make that change." : "Tokens can't reach that endpoint.";
  if (needed === "session") return "That can only be done by a person signed in to the dashboard.";
  if (needed !== null && !req.scopes.includes(needed)) return `This token is missing the "${needed}" scope.`;

  if (req.projectIds) {
    if (orgWide.some((r) => r.test(req.path))) return "This token is limited to some projects, so it can't read organisation-wide figures.";
    if (needsProjectQuery.some((r) => r.test(req.path))) {
      if (!req.project) return "This token is limited to some projects, so name the project you mean.";
      if (!req.projectIds.includes(req.project)) return "This token doesn't have access to that project.";
    }
  }
  return null;
}

export const enforceScope: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.get("token");
  // A signed-in person is bounded by their role, not by scopes.
  if (!token) return next();
  const refusal = scopeCheck({
    method: c.req.method,
    path: subPath(c),
    scopes: token.scopes,
    projectIds: token.projectIds,
    project: c.req.query("project"),
  });
  if (refusal) throw forbidden(refusal);
  await next();
};

/* -------------------------------------------------------------- the fence */

/** The projects a token may touch, or null when it may touch all of them. */
export const projectFence = (c: Context<AppEnv>): string[] | null => c.get("token")?.projectIds ?? null;

/** A `where` clause limiting rows to the token's projects. Undefined when unfenced. */
export function fenced(c: Context<AppEnv>, column: AnyPgColumn): SQL | undefined {
  const fence = projectFence(c);
  if (!fence) return undefined;
  // An empty fence is a token that can see nothing, rather than everything.
  return fence.length ? inArray(column, fence) : sql`false`;
}

/** Throws if the token may not touch this project. */
export function assertProject(c: Context<AppEnv>, projectId: string) {
  const fence = projectFence(c);
  if (fence && !fence.includes(projectId)) throw forbidden("This token doesn't have access to that project.");
}

/* -------------------------------------------------------------- audit trail */

const auditable = new Set(["POST", "PATCH", "PUT", "DELETE"]);
/** Changes too routine to be worth a line in the trail. */
const quiet = [/^\/preferences$/, /^\/connections\/[^/]+\/(validate|targets)$/];

/**
 * Records every change, by a person or by a token, after it succeeded. The
 * insert is deliberately detached: a trail that can fail a request would be
 * worse than one with a gap in it.
 */
export const auditTrail: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (!auditable.has(c.req.method) || c.res.status >= 400) return;
  const path = subPath(c);
  if (quiet.some((r) => r.test(path))) return;
  const user = c.get("user");
  const token = c.get("token");
  void db
    .insert(schema.auditEvents)
    .values({
      id: newId("aud"),
      orgId: c.get("orgId"),
      userId: user?.id ?? null,
      tokenId: token?.id ?? null,
      actor: user?.name || user?.email || "unknown",
      via: token ? "token" : "session",
      action: actionFor(c.req.method, path),
      target: targetFor(path),
      details: { method: c.req.method, path },
      ip: callerIp(c),
    })
    .catch((err) => console.error("[audit]", err));
};

const verbs: Record<string, string> = { POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };

/** Ids are prefixed and lowercase, e.g. prj_8f2k…, which is how a path part is told from a name. */
const isId = (part: string) => /^[a-z]{3}_[a-z0-9]+$/.test(part);

/** "destination.update" from PATCH /projects/prj_x/destinations/dst_y. */
export function actionFor(method: string, path: string): string {
  const nouns = path.split("/").filter((p) => p && !isId(p));
  const noun = singular(nouns[nouns.length - 1] ?? "organisation");
  return `${noun}.${verbs[method] ?? method.toLowerCase()}`;
}

const singular = (word: string) => word.replace(/ies$/, "y").replace(/s$/, "");

/** The id the change was about, when the path names one. */
function targetFor(path: string): string | null {
  const ids = path.split("/").filter(isId);
  return ids[ids.length - 1] ?? null;
}

/* ---------------------------------------------------------------- creating */

export async function createAccessToken(input: {
  orgId: string;
  userId: string;
  name: string;
  scopes: Scope[];
  projectIds: string[] | null;
  expiresAt: Date | null;
}) {
  const secret = newAccessTokenSecret();
  const id = newId("akt");
  await db.insert(schema.accessTokens).values({
    id,
    orgId: input.orgId,
    userId: input.userId,
    name: input.name,
    prefix: tokenPrefix(secret),
    tokenHash: sha256(secret),
    scopes: input.scopes,
    projectIds: input.projectIds,
    expiresAt: input.expiresAt,
  });
  return { id, secret };
}
