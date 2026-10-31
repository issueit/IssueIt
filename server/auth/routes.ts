import { Hono } from "hono";
import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { decrypt, encrypt, hashPassword, sha256, verifyPassword } from "../lib/crypto";
import { AppError, badRequest, conflict, forbidden, tooMany } from "../lib/errors";
import { newId } from "../lib/ids";
import { storage } from "../lib/storage";
import { hit } from "../lib/ratelimit";
import { startingPlan } from "../billing/entitlements";
import { queueNotice, sendNoticeNow } from "../mail/notices";
import { systemMailAvailable } from "../mail/system";
import { body, clientIp, type AppEnv } from "../http";
import { consumeCode, issueCode, revokeCodes } from "./codes";
import { newRecoveryCodes, newTotpSecret, normaliseRecoveryCode, otpauthUrl, verifyTotp } from "./totp";
import { createSession, destroySession, requireUser } from "./session";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const password = z.string().min(10, "Use at least 10 characters.").max(200);
const name = z.string().trim().min(1, "Enter your name.").max(80);

function throttle(key: string, max = 10) {
  const r = hit({ key, max, windowMs: 60_000 });
  if (!r.ok) throw tooMany("Too many attempts. Wait a minute and try again.");
}

export const authRoutes = new Hono<AppEnv>()
  .post("/signup", async (c) => {
    if (!config.allowSignup) throw forbidden("Sign-ups are closed on this server. Ask an owner for an invitation.");
    throttle(`signup:${clientIp(c)}`, 5);
    const input = await body(
      c,
      z.object({
        name,
        email,
        password,
        organisation: z.string().trim().max(80).optional(),
        invitation: z.string().optional(),
      }),
    );
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
    if (existing) throw conflict("An account with this email already exists. Sign in instead.");

    const userId = newId("usr");
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({ id: userId, email: input.email, name: input.name, passwordHash: await hashPassword(input.password) });
      // People joining through an invitation don't need an organisation of their own.
      if (!input.invitation) {
        const orgId = newId("org");
        await tx
          .insert(schema.organisations)
          .values({ id: orgId, name: input.organisation || `${input.name.split(" ")[0]}'s organisation`, ...startingPlan() });
        await tx.insert(schema.memberships).values({ orgId, userId, role: "owner" });
      }
    });
    await sendVerification(userId, input.email);
    await createSession(c, userId);
    return c.json({ ok: true }, 201);
  })
  .post("/login", async (c) => {
    const input = await body(c, z.object({ email, password: z.string().min(1).max(200) }));
    throttle(`login:${clientIp(c)}`, 20);
    throttle(`login:${input.email}`, 8);
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
    // Hash even when the user doesn't exist so timing doesn't reveal accounts.
    const ok = user ? await verifyPassword(input.password, user.passwordHash) : (await hashPassword(input.password), false);
    if (!user || !ok) throw new AppError(401, "invalid_credentials", "That email and password don't match.");
    // With two-factor on, the password only earns a short-lived ticket; the
    // session comes after the code.
    if (user.totpEnabledAt) return c.json({ twoFactor: true, ticket: await issueCode("second-factor", user.id) });
    await createSession(c, user.id);
    return c.json({ ok: true });
  })
  /** The second step of signing in: a code from the app, or a recovery code. */
  .post("/second-factor", async (c) => {
    const input = await body(c, z.object({ ticket: z.string().min(1), code: z.string().min(1).max(40) }));
    throttle(`second-factor:${clientIp(c)}`, 20);
    const spent = await consumeCode("second-factor", input.ticket);
    if (!spent) throw new AppError(401, "invalid_credentials", "That sign-in attempt has expired. Enter your password again.");
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, spent.userId) });
    if (!user?.totpSecret) throw new AppError(401, "invalid_credentials", "Two-factor isn't set up for this account.");
    throttle(`second-factor:${user.id}`, 10);

    if (verifyTotp(decrypt(user.totpSecret), input.code)) {
      await createSession(c, user.id);
      return c.json({ ok: true });
    }
    // A recovery code is spent as it is used, so one written on a Post-it
    // can't be used twice.
    const offered = sha256(normaliseRecoveryCode(input.code));
    if (user.recoveryCodes.includes(offered)) {
      await db
        .update(schema.users)
        .set({ recoveryCodes: user.recoveryCodes.filter((h) => h !== offered), updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
      await createSession(c, user.id);
      return c.json({ ok: true, recoveryCodeUsed: true, recoveryCodesLeft: user.recoveryCodes.length - 1 });
    }
    throw new AppError(401, "invalid_credentials", "That code isn't right. Codes change every 30 seconds, so try the current one.");
  })
  /**
   * Starts a password reset. Always answers the same way: whether an address
   * has an account here is not something a stranger gets to find out.
   */
  .post("/forgot", async (c) => {
    const input = await body(c, z.object({ email }));
    throttle(`forgot:${clientIp(c)}`, 5);
    throttle(`forgot:${input.email}`, 3);
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
    if (user) {
      const token = await issueCode("reset", user.id);
      await sendNoticeNow({
        to: user.email,
        kind: "password-reset",
        userId: user.id,
        context: { url: `${config.appUrl}/reset?token=${encodeURIComponent(token)}`, email: user.email, minutes: 60 },
      });
    }
    return c.json({ ok: true, sent: true });
  })
  .post("/reset", async (c) => {
    const input = await body(c, z.object({ token: z.string().min(1), password }));
    throttle(`reset:${clientIp(c)}`, 10);
    const spent = await consumeCode("reset", input.token);
    if (!spent) throw badRequest("That reset link has expired or has already been used. Ask for another.");
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
      .where(eq(schema.users.id, spent.userId));
    // A reset is also how someone locked out gets back in, so everything
    // signed in before now is signed out.
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, spent.userId));
    await revokeCodes("reset", spent.userId);
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, spent.userId) });
    // Two-factor still applies: a reset link to an inbox shouldn't be enough on its own.
    if (user?.totpEnabledAt) return c.json({ ok: true, twoFactor: true, ticket: await issueCode("second-factor", spent.userId) });
    await createSession(c, spent.userId);
    return c.json({ ok: true });
  })
  /** Proving an address. Public, because the link is usually opened signed out. */
  .post("/verify", async (c) => {
    const input = await body(c, z.object({ token: z.string().min(1) }));
    throttle(`verify:${clientIp(c)}`, 20);
    const spent = await consumeCode("verify", input.token);
    if (!spent) throw badRequest("That confirmation link has expired or has already been used.");
    await db
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), ...(spent.email ? { email: spent.email } : {}), updatedAt: new Date() })
      .where(eq(schema.users.id, spent.userId));
    return c.json({ ok: true });
  })
  .post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })
  .get("/config", (c) => c.json({ allowSignup: config.allowSignup, email: systemMailAvailable(), edition: config.edition }));

/** Queues the "confirm your address" email. Quiet when the install can't send email. */
async function sendVerification(userId: string, email: string) {
  const token = await issueCode("verify", userId, email);
  await queueNotice({
    to: email,
    kind: "verify-email",
    userId,
    context: { url: `${config.appUrl}/verify?token=${encodeURIComponent(token)}`, email },
  });
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user");
    const orgs = await db
      .select({ id: schema.organisations.id, name: schema.organisations.name, role: schema.memberships.role })
      .from(schema.memberships)
      .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
      .where(eq(schema.memberships.userId, user.id))
      .orderBy(schema.organisations.createdAt);
    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        emailVerified: !!user.emailVerifiedAt,
        twoFactor: !!user.totpEnabledAt,
        recoveryCodesLeft: user.recoveryCodes.length,
      },
      organisations: orgs,
    });
  })
  .patch("/", async (c) => {
    const input = await body(c, z.object({ name: name.optional(), email: email.optional() }));
    const user = c.get("user");
    if (input.email && input.email !== user.email) {
      const taken = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
      if (taken) throw conflict("Another account already uses that email.");
    }
    const changing = !!input.email && input.email !== user.email;
    await db
      .update(schema.users)
      .set({ ...input, ...(changing ? { emailVerifiedAt: null } : {}), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    if (changing) await sendVerification(user.id, input.email!);
    return c.json({ ok: true, verificationSent: changing });
  })
  /** Another copy of the confirmation link. */
  .post("/verify/send", async (c) => {
    const user = c.get("user");
    throttle(`verify-send:${user.id}`, 3);
    if (user.emailVerifiedAt) return c.json({ ok: true, alreadyVerified: true });
    await sendVerification(user.id, user.email);
    return c.json({ ok: true });
  })
  /**
   * Two-factor, in two steps: this hands out a secret and keeps it unproven,
   * and /totp/confirm turns it on once a code from it has worked. Half a
   * setup can't lock anyone out that way.
   */
  .post("/totp", async (c) => {
    const user = c.get("user");
    if (user.totpEnabledAt) throw conflict("Two-factor is already on. Turn it off first if you want to start again.");
    const secret = newTotpSecret();
    await db.update(schema.users).set({ totpSecret: encrypt(secret), updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    return c.json({ secret, url: otpauthUrl(secret, user.email) });
  })
  .post("/totp/confirm", async (c) => {
    const input = await body(c, z.object({ code: z.string().min(1).max(12) }));
    const user = c.get("user");
    throttle(`totp-confirm:${user.id}`, 10);
    if (!user.totpSecret) throw badRequest("Start again: there's no key waiting to be confirmed.");
    if (user.totpEnabledAt) throw conflict("Two-factor is already on.");
    if (!verifyTotp(decrypt(user.totpSecret), input.code)) throw badRequest("That code isn't right. Codes change every 30 seconds, so try the current one.");
    const codes = newRecoveryCodes();
    await db
      .update(schema.users)
      .set({ totpEnabledAt: new Date(), recoveryCodes: codes.map((code) => sha256(normaliseRecoveryCode(code))), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    // Shown once. Issueit only keeps the hashes.
    return c.json({ ok: true, recoveryCodes: codes });
  })
  .post("/totp/recovery", async (c) => {
    const input = await body(c, z.object({ password: z.string().min(1) }));
    const user = c.get("user");
    throttle(`totp-recovery:${user.id}`, 5);
    if (!(await verifyPassword(input.password, user.passwordHash))) throw badRequest("That password isn't right.");
    if (!user.totpEnabledAt) throw badRequest("Two-factor isn't on for this account.");
    const codes = newRecoveryCodes();
    await db
      .update(schema.users)
      .set({ recoveryCodes: codes.map((code) => sha256(normaliseRecoveryCode(code))), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    return c.json({ ok: true, recoveryCodes: codes });
  })
  .delete("/totp", async (c) => {
    const input = await body(c, z.object({ password: z.string().min(1) }));
    const user = c.get("user");
    throttle(`totp-off:${user.id}`, 5);
    if (!(await verifyPassword(input.password, user.passwordHash))) throw badRequest("That password isn't right.");
    await db
      .update(schema.users)
      .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: [], updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    return c.json({ ok: true });
  })
  .post("/password", async (c) => {
    const input = await body(c, z.object({ current: z.string().min(1), next: password }));
    const user = c.get("user");
    throttle(`password:${user.id}`, 5);
    if (!(await verifyPassword(input.current, user.passwordHash))) throw badRequest("Your current password isn't right.");
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(input.next), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    // Changing the password signs out every other session.
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.id, c.get("sessionId"))));
    return c.json({ ok: true });
  })
  .get("/sessions", async (c) => {
    const rows = await db
      .select({ id: schema.sessions.id, userAgent: schema.sessions.userAgent, createdAt: schema.sessions.createdAt, lastSeenAt: schema.sessions.lastSeenAt })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, c.get("user").id))
      .orderBy(dsql`${schema.sessions.lastSeenAt} desc`);
    return c.json({
      sessions: rows.map((r) => ({ ...r, id: r.id.slice(0, 12), current: r.id === c.get("sessionId") })),
    });
  })
  .delete("/sessions", async (c) => {
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, c.get("user").id), ne(schema.sessions.id, c.get("sessionId"))));
    return c.json({ ok: true });
  })
  .delete("/", async (c) => {
    const user = c.get("user");
    const input = await body(c, z.object({ password: z.string().min(1) }));
    if (!(await verifyPassword(input.password, user.passwordHash))) throw badRequest("That password isn't right.");
    // Refuse if the user is the only owner of an organisation that has other members.
    const owned = await db.execute<{ org_id: string; name: string }>(dsql`
      select m.org_id, o.name from memberships m join organisations o on o.id = m.org_id
      where m.user_id = ${user.id} and m.role = 'owner'
        and not exists (select 1 from memberships m2 where m2.org_id = m.org_id and m2.role = 'owner' and m2.user_id <> ${user.id})
        and exists (select 1 from memberships m3 where m3.org_id = m.org_id and m3.user_id <> ${user.id})`);
    if (owned.length) throw conflict(`Make someone else an owner of ${owned[0].name} first.`);
    const removed = await db.transaction(async (tx) => {
      // Organisations where this user is the only member go with them.
      const orgs = await tx.execute<{ id: string }>(dsql`
        delete from organisations o where exists (select 1 from memberships m where m.org_id = o.id and m.user_id = ${user.id})
          and not exists (select 1 from memberships m2 where m2.org_id = o.id and m2.user_id <> ${user.id})
        returning o.id`);
      await tx.delete(schema.users).where(eq(schema.users.id, user.id));
      return orgs.map((o) => o.id);
    });
    // Their attachment files too, as when an organisation is deleted directly.
    await Promise.all(removed.map((id) => storage.removePrefix(id).catch(() => {})));
    await destroySession(c);
    return c.json({ ok: true });
  });
