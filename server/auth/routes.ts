import { Hono } from "hono";
import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { AppError, badRequest, conflict, forbidden, tooMany } from "../lib/errors";
import { newId } from "../lib/ids";
import { storage } from "../lib/storage";
import { hit } from "../lib/ratelimit";
import { body, clientIp, type AppEnv } from "../http";
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
        await tx.insert(schema.organisations).values({ id: orgId, name: input.organisation || `${input.name.split(" ")[0]}'s organisation` });
        await tx.insert(schema.memberships).values({ orgId, userId, role: "owner" });
      }
    });
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
    await createSession(c, user.id);
    return c.json({ ok: true });
  })
  .post("/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })
  .get("/config", (c) => c.json({ allowSignup: config.allowSignup }));

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
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
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
    await db
      .update(schema.users)
      .set({ ...input, updatedAt: new Date() })
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
