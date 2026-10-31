import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { defaultNotifyPrefs, notifyWithDefaults } from "../db/schema";
import { badRequest } from "../lib/errors";
import { body, type AppEnv } from "../http";
import { has } from "../billing/entitlements";
import { upgradeRequired } from "../billing/entitlements";
import { previewDigest } from "../jobs/digest";
import { systemMailAvailable } from "../mail/system";

/**
 * What Issueit emails this person about this organisation. Per person and
 * per organisation, because you might want every report from your own
 * project and nothing from a colleague's.
 */

const prefsInput = z.object({
  reports: z.enum(["off", "critical", "high", "all"]).optional(),
  pipeline: z.boolean().optional(),
  digest: z.enum(["off", "daily", "weekly"]).optional(),
  mutedProjects: z.array(z.string()).max(200).optional(),
});

export const notificationRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const userId = c.get("user").id;
    const row = await db.query.memberships.findFirst({
      where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)),
      columns: { preferences: true },
    });
    const projects = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.orgId, orgId))
      .orderBy(schema.projects.createdAt);
    return c.json({
      notify: notifyWithDefaults(row?.preferences),
      defaults: defaultNotifyPrefs,
      projects,
      /** Without a mail server nothing here can be sent, and the page says so. */
      email: systemMailAvailable(),
      digestAvailable: has(c.get("org"), "digest"),
    });
  })
  .patch("/", async (c) => {
    const input = await body(c, prefsInput);
    if (input.digest && input.digest !== "off" && !has(c.get("org"), "digest")) throw upgradeRequired("digest");
    const orgId = c.get("orgId");
    const userId = c.get("user").id;
    const [row] = await db
      .update(schema.memberships)
      .set({
        // Merged into whatever else lives in preferences, like the dashboard layout.
        preferences: sql`jsonb_set(coalesce(${schema.memberships.preferences}, '{}'::jsonb), '{notify}', coalesce(${schema.memberships.preferences}->'notify', '{}'::jsonb) || ${JSON.stringify(input)}::jsonb, true)`,
      })
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)))
      .returning({ preferences: schema.memberships.preferences });
    return c.json({ notify: notifyWithDefaults(row?.preferences) });
  })
  /** A digest now, with this organisation's real numbers, so nobody waits a day to see one. */
  .post("/test", async (c) => {
    if (!systemMailAvailable()) throw badRequest("This server has no mail server set up, so Issueit can't send email.");
    const user = c.get("user");
    const sent = await previewDigest(c.get("orgId"), user.email, user.id);
    return c.json({ ok: sent, to: user.email });
  });
