import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { ownerOnlyScopes, scopes as allScopes, type Scope } from "../db/schema";
import { randomToken, sha256 } from "../lib/crypto";
import { badRequest, forbidden, notFound, tooMany } from "../lib/errors";
import { hit } from "../lib/ratelimit";
import { clientIp, body, type AppEnv } from "../http";
import { createAccessToken } from "./tokens";
import { requireUser } from "./session";

/**
 * Signing in from a terminal. The command line asks for a code, shows it,
 * and polls; a person approves it in the dashboard, where they can see what
 * is being asked for. No secret is ever typed into a terminal, pasted into
 * a shell history, or read out over a call.
 */

const MINUTES = 15;
const POLL_SECONDS = 5;
/** No 0/O or 1/I: these get read aloud and typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Eight characters in two groups. The alphabet divides 256 exactly, so there is no bias to sample away. */
function userCode(): string {
  let out = "";
  for (const byte of randomBytes(8)) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

const normalise = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const startInput = z.object({
  /** What to call the token this becomes, e.g. "issueit CLI on laptop". */
  name: z.string().trim().min(1).max(60).default("Command line"),
  scopes: z.array(z.enum(allScopes)).min(1).max(allScopes.length).default([...allScopes]),
});

/** Unauthenticated: anyone may ask, but only a signed-in person can approve. */
export const deviceRoutes = new Hono<AppEnv>()
  .post("/", async (c) => {
    const input = await body(c, startInput);
    const limit = hit({ key: `device:start:${clientIp(c)}`, max: 10, windowMs: 600_000 });
    if (!limit.ok) throw tooMany("Too many sign-in attempts from here. Try again shortly.");

    await db.delete(schema.deviceCodes).where(lt(schema.deviceCodes.expiresAt, new Date()));
    const secret = randomToken(32);
    const code = userCode();
    await db.insert(schema.deviceCodes).values({
      id: sha256(secret),
      userCode: normalise(code),
      name: input.name,
      scopes: [...new Set(input.scopes)] as Scope[],
      expiresAt: new Date(Date.now() + MINUTES * 60_000),
    });
    return c.json({
      device_code: secret,
      user_code: code,
      verification_uri: `${config.appUrl}/device`,
      verification_uri_complete: `${config.appUrl}/device?code=${encodeURIComponent(code)}`,
      expires_in: MINUTES * 60,
      interval: POLL_SECONDS,
    });
  })

  /**
   * The command line polls here. Follows the device-flow convention: the
   * errors are states, not failures, so a client can act on them.
   */
  .post("/token", async (c) => {
    const input = await body(c, z.object({ device_code: z.string().min(10).max(200) }));
    const id = sha256(input.device_code);
    const limit = hit({ key: `device:poll:${id}`, max: 2, windowMs: POLL_SECONDS * 1000 });
    if (!limit.ok) return c.json({ error: "slow_down", interval: POLL_SECONDS, message: `Poll every ${POLL_SECONDS} seconds.` }, 429);

    const row = await db.query.deviceCodes.findFirst({ where: eq(schema.deviceCodes.id, id) });
    if (!row || row.expiresAt < new Date()) return c.json({ error: "expired_token", message: "That sign-in took too long. Start again." }, 400);
    if (row.status === "denied") return c.json({ error: "access_denied", message: "The sign-in was refused." }, 400);
    if (row.status === "pending") return c.json({ error: "authorization_pending", message: "Waiting for someone to approve it." }, 400);

    // Approved: hand the token over once, then forget it.
    await db.delete(schema.deviceCodes).where(eq(schema.deviceCodes.id, id));
    if (!row.tokenSecret) return c.json({ error: "expired_token", message: "That sign-in was already used. Start again." }, 400);
    const org = row.orgId ? await db.query.organisations.findFirst({ where: eq(schema.organisations.id, row.orgId), columns: { id: true, name: true } }) : null;
    return c.json({ token: row.tokenSecret, organisation: org, scopes: row.scopes, app_url: config.appUrl });
  });

/** Signed in: looking at, and deciding on, a pending request. */
export const deviceApprovalRoutes = new Hono<AppEnv>()
  .use("*", requireUser)
  .get("/:code", async (c) => {
    const row = await pending(c.req.param("code"), clientIp(c));
    return c.json({ request: { name: row.name, scopes: row.scopes, expiresAt: row.expiresAt, status: row.status } });
  })

  .post("/:code", async (c) => {
    const input = await body(c, z.object({ approve: z.boolean(), orgId: z.string().trim().max(40).optional() }));
    const row = await pending(c.req.param("code"), clientIp(c));
    const user = c.get("user");

    if (!input.approve) {
      await db.update(schema.deviceCodes).set({ status: "denied" }).where(eq(schema.deviceCodes.id, row.id));
      return c.json({ ok: true, approved: false });
    }

    const memberships = await db
      .select({ orgId: schema.memberships.orgId, role: schema.memberships.role })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id))
      .orderBy(schema.memberships.createdAt);
    const chosen = input.orgId ? memberships.find((m) => m.orgId === input.orgId) : memberships[0];
    if (!chosen) throw forbidden("You aren't a member of that organisation.");

    // The same ceiling as anywhere else: a member can't grant what they haven't got.
    const granted = chosen.role === "owner" ? row.scopes : row.scopes.filter((s) => !ownerOnlyScopes.includes(s));
    if (!granted.length) throw badRequest("Everything this sign-in asked for needs an organisation owner.");

    const { secret } = await createAccessToken({
      orgId: chosen.orgId,
      userId: user.id,
      name: row.name,
      scopes: granted,
      projectIds: null,
      expiresAt: new Date(Date.now() + 90 * 86400_000),
    });
    await db
      .update(schema.deviceCodes)
      .set({ status: "approved", userId: user.id, orgId: chosen.orgId, tokenSecret: secret, approvedAt: new Date(), scopes: granted })
      .where(eq(schema.deviceCodes.id, row.id));
    return c.json({ ok: true, approved: true, scopes: granted, organisation: chosen.orgId });
  });

/** Codes are short and typed by hand, so guessing at them is rate-limited hard. */
async function pending(code: string, ip: string) {
  const limit = hit({ key: `device:lookup:${ip}`, max: 20, windowMs: 600_000 });
  if (!limit.ok) throw tooMany("Too many codes tried from here. Wait a few minutes.");
  const row = await db.query.deviceCodes.findFirst({
    where: and(eq(schema.deviceCodes.userCode, normalise(code))),
  });
  if (!row || row.expiresAt < new Date()) throw notFound("That code");
  if (row.status !== "pending") throw badRequest("That code has already been dealt with.");
  return row;
}
