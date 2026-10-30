import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, gt, lt } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { randomToken, sha256 } from "../lib/crypto";
import { forbidden, unauthorised } from "../lib/errors";
import type { AppEnv } from "../http";

export const SESSION_COOKIE = config.cookieSecure ? "__Host-issueit_session" : "issueit_session";
const SESSION_DAYS = 30;

export async function createSession(c: Context, userId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  // Expired sessions are useless; clear them out rather than keep them forever.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    userAgent: c.req.header("user-agent")?.slice(0, 300),
    expiresAt,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: config.cookieSecure });
}

/** Requires a signed-in user. Also enforces same-origin for state-changing requests. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host && origin !== config.appUrl) {
      throw forbidden("Cross-site requests aren't allowed.");
    }
  }
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw unauthorised();
  const id = sha256(token);
  const [row] = await db
    .select({ user: schema.users, session: schema.sessions })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: config.cookieSecure });
    throw unauthorised();
  }
  // Refresh last-seen at most every ten minutes.
  if (Date.now() - row.session.lastSeenAt.getTime() > 600_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, id));
  }
  c.set("user", row.user);
  c.set("sessionId", id);
  await next();
};

/**
 * Resolves :org from the path and checks the user belongs to it. Every
 * organisation-scoped query must then filter by c.get("orgId").
 */
export const requireOrg: MiddlewareHandler<AppEnv> = async (c, next) => {
  const orgId = c.req.param("org");
  if (!orgId) throw forbidden();
  const [m] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, c.get("user").id)))
    .limit(1);
  if (!m) throw forbidden("You aren't a member of this organisation.");
  c.set("orgId", orgId);
  c.set("role", m.role);
  await next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("role") !== "owner") throw forbidden("Only organisation owners can do this.");
  await next();
};
