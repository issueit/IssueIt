import { Hono } from "hono";
import { and, eq, gt, isNotNull, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { randomToken, sha256 } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { storage } from "../lib/storage";
import { body, type AppEnv } from "../http";
import { requireOrg, requireOwner, requireUser } from "../auth/session";
import { policySchema } from "../delivery/policy";

const orgName = z.string().trim().min(1, "Enter a name.").max(80);

/** Routes under /api/orgs. Organisation-scoped routes live under /api/orgs/:org. */
export const orgRoutes = new Hono<AppEnv>().post("/", requireUser, async (c) => {
  const input = await body(c, z.object({ name: orgName }));
  const id = newId("org");
  await db.transaction(async (tx) => {
    await tx.insert(schema.organisations).values({ id, name: input.name });
    await tx.insert(schema.memberships).values({ orgId: id, userId: c.get("user").id, role: "owner" });
  });
  return c.json({ id }, 201);
});

export const orgScoped = new Hono<AppEnv>()
  .get("/", async (c) => {
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, c.get("orgId")) });
    if (!org) throw notFound("Organisation");
    return c.json({ organisation: { ...org, role: c.get("role") } });
  })
  .patch("/", requireOwner, async (c) => {
    const input = await body(
      c,
      z.object({
        name: orgName.optional(),
        settings: z
          .object({
            delivery: policySchema.optional(),
            location: z.enum(["auto", "timezone", "off"]).optional(),
          })
          .optional(),
      }),
    );
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, c.get("orgId")) });
    if (!org) throw notFound("Organisation");
    await db
      .update(schema.organisations)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.settings && { settings: { ...org.settings, ...input.settings } }),
        updatedAt: new Date(),
      })
      .where(eq(schema.organisations.id, org.id));
    return c.json({ ok: true });
  })

  /* ------------------------------------------------------------ your preferences here */
  .get("/preferences", async (c) => {
    const row = await db.query.memberships.findFirst({
      where: and(eq(schema.memberships.orgId, c.get("orgId")), eq(schema.memberships.userId, c.get("user").id)),
      columns: { preferences: true },
    });
    return c.json({ preferences: row?.preferences ?? {} });
  })
  .put("/preferences", async (c) => {
    const input = await body(c, z.object({ preferences: z.record(z.string(), z.unknown()) }));
    if (JSON.stringify(input.preferences).length > 64_000) throw badRequest("Those preferences are too large to save.");
    await db
      .update(schema.memberships)
      .set({ preferences: input.preferences })
      .where(and(eq(schema.memberships.orgId, c.get("orgId")), eq(schema.memberships.userId, c.get("user").id)));
    return c.json({ ok: true });
  })
  .delete("/", requireOwner, async (c) => {
    const input = await body(c, z.object({ confirm: z.string() }));
    const orgId = c.get("orgId");
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, orgId) });
    if (!org) throw notFound("Organisation");
    if (input.confirm.trim() !== org.name) throw badRequest("Type the organisation's name exactly to confirm.");
    await db.delete(schema.organisations).where(eq(schema.organisations.id, orgId));
    await storage.removePrefix(orgId).catch(() => {});
    return c.json({ ok: true });
  })

  /* ------------------------------------------------------------ members */
  .get("/members", async (c) => {
    const orgId = c.get("orgId");
    const members = await db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role, joinedAt: schema.memberships.createdAt })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, orgId))
      .orderBy(schema.memberships.createdAt);
    const invitations = await db
      .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt, createdAt: schema.invitations.createdAt })
      .from(schema.invitations)
      .where(and(eq(schema.invitations.orgId, orgId), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, new Date())))
      .orderBy(schema.invitations.createdAt);
    return c.json({ members, invitations });
  })
  .patch("/members/:userId", requireOwner, async (c) => {
    const input = await body(c, z.object({ role: z.enum(["owner", "member"]) }));
    const orgId = c.get("orgId");
    const userId = c.req.param("userId");
    if (input.role === "member") await assertAnotherOwner(orgId, userId);
    const res = await db
      .update(schema.memberships)
      .set({ role: input.role })
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)))
      .returning();
    if (!res.length) throw notFound("Member");
    return c.json({ ok: true });
  })
  .delete("/members/:userId", async (c) => {
    const orgId = c.get("orgId");
    const userId = c.req.param("userId");
    const self = userId === c.get("user").id;
    if (!self && c.get("role") !== "owner") throw forbidden("Only owners can remove members.");
    await assertAnotherOwner(orgId, userId);
    await db.delete(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)));
    return c.json({ ok: true });
  })

  /* ------------------------------------------------------------ invitations */
  .post("/invitations", requireOwner, async (c) => {
    const input = await body(c, z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address."), role: z.enum(["owner", "member"]).default("member") }));
    const orgId = c.get("orgId");
    const already = await db
      .select({ id: schema.users.id })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.users.email, input.email)));
    if (already.length) throw conflict("That person is already a member.");
    // Used and lapsed invitations have no further purpose; don't keep them, or the addresses in them.
    await db.delete(schema.invitations).where(or(lt(schema.invitations.expiresAt, new Date()), isNotNull(schema.invitations.acceptedAt)));
    const token = randomToken(24);
    await db.insert(schema.invitations).values({
      id: newId("inv"),
      orgId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: c.get("user").id,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });
    return c.json({ link: `${config.appUrl}/invite/${token}` }, 201);
  })
  .delete("/invitations/:id", requireOwner, async (c) => {
    await db.delete(schema.invitations).where(and(eq(schema.invitations.orgId, c.get("orgId")), eq(schema.invitations.id, c.req.param("id"))));
    return c.json({ ok: true });
  });

async function assertAnotherOwner(orgId: string, leavingUserId: string) {
  const [row] = await db.execute<{ n: number }>(dsql`select count(*)::int as n from memberships where org_id = ${orgId} and role = 'owner' and user_id <> ${leavingUserId}`);
  const target = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, leavingUserId)),
  });
  if (target?.role === "owner" && row.n === 0) throw conflict("An organisation needs at least one owner.");
}

/** Public lookup and acceptance of invitation links. */
export const invitationRoutes = new Hono<AppEnv>()
  .get("/:token", async (c) => {
    const inv = await findInvitation(c.req.param("token"));
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, inv.orgId) });
    return c.json({ organisation: org?.name, email: inv.email, role: inv.role });
  })
  .post("/:token/accept", requireUser, async (c) => {
    const inv = await findInvitation(c.req.param("token"));
    const user = c.get("user");
    await db.transaction(async (tx) => {
      await tx.insert(schema.memberships).values({ orgId: inv.orgId, userId: user.id, role: inv.role }).onConflictDoNothing();
      await tx.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.id));
    });
    return c.json({ orgId: inv.orgId });
  });

async function findInvitation(token: string) {
  const inv = await db.query.invitations.findFirst({ where: eq(schema.invitations.tokenHash, sha256(token)) });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw notFound("This invitation");
  return inv;
}

export { requireOrg };
