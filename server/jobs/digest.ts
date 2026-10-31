import { sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { has, refusedThisMonth } from "../billing/entitlements";
import { digestAudience } from "../mail/notify";
import { queueNotice } from "../mail/notices";

/**
 * The digest: what arrived, what was resolved, what's stuck. Sent only to
 * people who asked for one, and worded so that a quiet day reads as a quiet
 * day rather than as an empty template.
 */

export async function runDigests(period: "daily" | "weekly"): Promise<number> {
  const days = period === "weekly" ? 7 : 1;
  const orgs = await db.query.organisations.findMany();
  let sent = 0;

  for (const org of orgs) {
    if (!has(org, "digest")) continue;
    const audience = await digestAudience(org.id, period);
    if (!audience.length) continue;

    const [counts] = await db.execute<{ created: number; resolved: number; failed: number }>(sql`
      select
        (select count(*) from reports where org_id = ${org.id} and created_at > now() - make_interval(days => ${days}) and group_id is null)::int as created,
        (select count(*) from reports where org_id = ${org.id} and resolved_at > now() - make_interval(days => ${days}))::int as resolved,
        (select count(*) from deliveries where org_id = ${org.id} and status = 'failed' and updated_at > now() - make_interval(days => ${days}) and not is_test)::int as failed`);

    const items = await db.execute<{ id: string; project_id: string; number: number; title: string; priority: string; duplicate_count: number }>(sql`
      select id, project_id, number, title, priority, duplicate_count from reports
      where org_id = ${org.id} and created_at > now() - make_interval(days => ${days}) and group_id is null
        and status in ('new', 'investigating')
      order by case priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, duplicate_count desc, created_at desc
      limit 8`);

    const refused = await refusedThisMonth(org.id);
    // Nothing happened and nothing is wrong: don't send anything at all.
    if (!counts.created && !counts.resolved && !counts.failed && !items.length) continue;

    for (const member of audience) {
      const queued = await queueNotice({
        to: member.email,
        kind: "digest",
        orgId: org.id,
        userId: member.userId,
        // One a day, or one a week, however many times the job runs.
        dedupeKey: `digest:${period}:${org.id}:${member.userId}:${new Date().toISOString().slice(0, 10)}`,
        context: {
          period: period === "weekly" ? "week" : "day",
          orgName: org.name,
          counts: { ...counts, refused },
          items: items.map((r) => ({
            title: `#${r.number} ${r.title}`,
            hint: [r.priority, r.duplicate_count ? `seen ${r.duplicate_count + 1} times` : null].filter(Boolean).join(" · "),
            url: `${config.appUrl}/projects/${r.project_id}/reports/${r.id}`,
          })),
          url: `${config.appUrl}/inbox`,
        },
      });
      if (queued) sent += 1;
    }
  }
  return sent;
}

/** A sample digest for the settings page, so nobody has to wait a day to see one. */
export async function previewDigest(orgId: string, to: string, userId: string): Promise<boolean> {
  const org = await db.query.organisations.findFirst({ where: sql`${schema.organisations.id} = ${orgId}` });
  if (!org) return false;
  const [counts] = await db.execute<{ created: number; resolved: number; failed: number }>(sql`
    select
      (select count(*) from reports where org_id = ${orgId} and created_at > now() - interval '1 day' and group_id is null)::int as created,
      (select count(*) from reports where org_id = ${orgId} and resolved_at > now() - interval '1 day')::int as resolved,
      (select count(*) from deliveries where org_id = ${orgId} and status = 'failed' and updated_at > now() - interval '1 day' and not is_test)::int as failed`);
  const items = await db.execute<{ id: string; project_id: string; number: number; title: string; priority: string }>(sql`
    select id, project_id, number, title, priority from reports
    where org_id = ${orgId} and group_id is null order by created_at desc limit 5`);
  return queueNotice({
    to,
    kind: "digest",
    orgId,
    userId,
    dedupeKey: `digest:preview:${userId}:${Date.now()}`,
    context: {
      period: "day",
      orgName: org.name,
      counts,
      items: items.map((r) => ({ title: `#${r.number} ${r.title}`, hint: r.priority, url: `${config.appUrl}/projects/${r.project_id}/reports/${r.id}` })),
      url: `${config.appUrl}/inbox`,
    },
  });
}
