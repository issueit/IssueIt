import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { agentScopes, ownerOnlyScopes, scopes as allScopes, type Scope } from "../db/schema";
import { sha256 } from "../lib/crypto";
import { forbidden, notFound } from "../lib/errors";
import { body, parse, type AppEnv } from "../http";
import { createAccessToken, newAccessTokenSecret, tokenPrefix } from "../auth/tokens";
import { config } from "../config";

/**
 * Account tokens, for the MCP server, the CLI and CI. Only reachable with a
 * dashboard session: a token may not mint another one, so a token can never
 * outlive what its owner meant to grant.
 */

const scopeList = z
  .array(z.enum(allScopes))
  .min(1, "Choose at least one thing this token may do.")
  .transform((list) => [...new Set(list)] as Scope[]);

const tokenInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  scopes: scopeList,
  /** Empty or missing means every project in the organisation. */
  projects: z.array(z.string().trim().max(40)).max(50).optional().nullable(),
  /** 0 or missing means it never expires. */
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
});

export const tokenRoutes = new Hono<AppEnv>()
  /** What a token may be given, so the dashboard and the docs agree. */
  .get("/scopes", (c) =>
    c.json({
      scopes: allScopes.map((id) => ({ id, label: scopeLabels[id], ownerOnly: ownerOnlyScopes.includes(id) })),
      suggested: { agent: agentScopes },
      role: c.get("role"),
    }),
  )

  .get("/", async (c) => {
    const owner = c.get("role") === "owner";
    const rows = await db
      .select({
        id: schema.accessTokens.id,
        name: schema.accessTokens.name,
        prefix: schema.accessTokens.prefix,
        scopes: schema.accessTokens.scopes,
        projectIds: schema.accessTokens.projectIds,
        lastUsedAt: schema.accessTokens.lastUsedAt,
        lastUsedIp: schema.accessTokens.lastUsedIp,
        expiresAt: schema.accessTokens.expiresAt,
        createdAt: schema.accessTokens.createdAt,
        userId: schema.accessTokens.userId,
        userName: schema.users.name,
      })
      .from(schema.accessTokens)
      .innerJoin(schema.users, eq(schema.users.id, schema.accessTokens.userId))
      .where(
        and(
          eq(schema.accessTokens.orgId, c.get("orgId")),
          isNull(schema.accessTokens.revokedAt),
          // Everyone sees their own; owners see the organisation's.
          owner ? undefined : eq(schema.accessTokens.userId, c.get("user").id),
        ),
      )
      .orderBy(desc(schema.accessTokens.createdAt));
    return c.json({ tokens: rows.map((r) => ({ ...r, mine: r.userId === c.get("user").id })) });
  })

  .post("/", async (c) => {
    const input = await body(c, tokenInput);
    const granted = await checkGrant(c.get("role"), c.get("orgId"), input);
    const { id, secret } = await createAccessToken({
      orgId: c.get("orgId"),
      userId: c.get("user").id,
      name: input.name,
      scopes: granted.scopes,
      projectIds: granted.projects,
      expiresAt: granted.expiresAt,
    });
    return c.json({ id, token: secret, prefix: tokenPrefix(secret), mcp: mcpConfig(secret) }, 201);
  })

  /** A new secret for the same token: same name, scopes and fence. */
  .post("/:id/rotate", async (c) => {
    const row = await own(c);
    const secret = newAccessTokenSecret();
    await db
      .update(schema.accessTokens)
      .set({ prefix: tokenPrefix(secret), tokenHash: sha256(secret), lastUsedAt: null, lastUsedIp: null })
      .where(eq(schema.accessTokens.id, row.id));
    return c.json({ token: secret, prefix: tokenPrefix(secret), mcp: mcpConfig(secret) });
  })

  .delete("/:id", async (c) => {
    const row = await own(c);
    await db.update(schema.accessTokens).set({ revokedAt: new Date() }).where(eq(schema.accessTokens.id, row.id));
    return c.json({ ok: true });
  });

/** Who the caller is and what they may do, for a client working it out at startup. */
export const whoamiRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const token = c.get("token");
  const orgId = c.get("orgId");
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), fence(token?.projectIds ?? null)))
    .orderBy(schema.projects.createdAt);
  const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, orgId)).limit(1);
  return c.json({
    user: { id: c.get("user").id, name: c.get("user").name, email: c.get("user").email },
    organisation: { id: orgId, name: org?.name ?? "", role: c.get("role") },
    auth: { via: c.get("via"), scopes: token?.scopes ?? "all", projects: token?.projectIds ?? "all" },
    projects,
    urls: { app: config.appUrl, drop: config.dropUrl, docs: config.docsUrl },
  });
});

const auditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});

/** Who changed what, newest first. */
export const auditRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const q = parse(auditQuery, c.req.query());
  const a = schema.auditEvents;
  const rows = await db
    .select({
      id: a.id,
      actor: a.actor,
      via: a.via,
      action: a.action,
      target: a.target,
      details: a.details,
      ip: a.ip,
      createdAt: a.createdAt,
      tokenName: schema.accessTokens.name,
    })
    .from(a)
    .leftJoin(schema.accessTokens, eq(schema.accessTokens.id, a.tokenId))
    .where(
      and(
        eq(a.orgId, c.get("orgId")),
        q.action ? sql`${a.action} like ${`${q.action}%`}` : undefined,
        q.actor ? sql`${a.actor} ilike ${`%${q.actor}%`}` : undefined,
        q.before ? sql`${a.createdAt} < ${q.before}::timestamptz` : undefined,
      ),
    )
    .orderBy(desc(a.createdAt))
    .limit(q.limit);
  return c.json({ events: rows });
});

/* ------------------------------------------------------------------ helpers */

/** Limits a query to a token's projects. An empty fence sees nothing, not everything. */
const fence = (projectIds: string[] | null) =>
  projectIds === null ? undefined : projectIds.length ? inArray(schema.projects.id, projectIds) : sql`false`;

/** Loads a token the caller may manage: their own, or anyone's if they own the organisation. */
async function own(c: Context<AppEnv>) {
  const row = await db.query.accessTokens.findFirst({
    where: and(eq(schema.accessTokens.id, c.req.param("id") ?? ""), eq(schema.accessTokens.orgId, c.get("orgId")), isNull(schema.accessTokens.revokedAt)),
  });
  if (!row) throw notFound("That token");
  if (row.userId !== c.get("user").id && c.get("role") !== "owner") throw forbidden("That token belongs to someone else.");
  return row;
}

/** Refuses scopes above the caller's role and projects outside the organisation. */
async function checkGrant(role: "owner" | "member", orgId: string, input: z.infer<typeof tokenInput>) {
  if (role !== "owner") {
    const above = input.scopes.filter((s) => ownerOnlyScopes.includes(s));
    if (above.length) throw forbidden(`Only organisation owners can grant ${above.join(" and ")}.`);
  }
  let projects: string[] | null = null;
  if (input.projects?.length) {
    const rows = await db.select({ id: schema.projects.id }).from(schema.projects).where(and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, input.projects)));
    const found = new Set(rows.map((r) => r.id));
    const missing = input.projects.filter((p) => !found.has(p));
    if (missing.length) throw notFound(`Project ${missing[0]}`);
    projects = [...found];
  }
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000) : null;
  return { scopes: input.scopes, projects, expiresAt };
}

/** Ready to paste into an MCP client's config. */
const mcpConfig = (secret: string) => ({
  command: "npx",
  args: ["-y", "@issueit/mcp"],
  env: { ISSUEIT_TOKEN: secret, ...(config.appUrl === "https://dash.issueit.app" ? {} : { ISSUEIT_URL: config.appUrl }) },
});

const scopeLabels: Record<Scope, string> = {
  "reports:read": "Read bug reports and their diagnostics",
  "reports:write": "Change a report's status, priority and grouping",
  "projects:read": "List projects and read their settings",
  "projects:write": "Create projects and change their settings",
  "destinations:read": "See where reports are delivered",
  "destinations:write": "Add, change and test destinations",
  "connections:read": "See connected accounts and what they can target",
  "connections:write": "Connect and disconnect accounts",
  "deliveries:read": "Read the delivery log",
  "deliveries:write": "Retry deliveries",
  "analytics:read": "Read counts, charts and usage",
  "keys:write": "Create and revoke a project's ingest keys",
  "org:read": "Read organisation settings and members",
  "org:write": "Change organisation settings and members",
};

export { scopeLabels };
