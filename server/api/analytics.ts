import { Hono } from "hono";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { parse, type AppEnv } from "../http";

/**
 * Numbers for the dashboard: one request returns every breakdown the
 * dashboard can show, so cards can be shown, hidden and rearranged without
 * new round trips. Buckets follow the viewer's time zone.
 */

const ranges = {
  "24h": { span: "24 hours", unit: "hour", step: "1 hour", format: "YYYY-MM-DD\"T\"HH24" },
  "7d": { span: "7 days", unit: "day", step: "1 day", format: "YYYY-MM-DD" },
  "30d": { span: "30 days", unit: "day", step: "1 day", format: "YYYY-MM-DD" },
  "90d": { span: "90 days", unit: "week", step: "1 week", format: "YYYY-MM-DD" },
  "12m": { span: "12 months", unit: "month", step: "1 month", format: "YYYY-MM" },
} as const;

const query = z.object({
  range: z.enum(["24h", "7d", "30d", "90d", "12m"]).default("30d"),
  project: z.string().max(40).optional(),
  tz: z.string().max(60).optional(),
});

function validZone(tz: string | undefined) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

type Count = { key: string | null; n: number };

export const analyticsRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const q = parse(query, c.req.query());
  const orgId = c.get("orgId");
  const r = ranges[q.range];
  const tz = validZone(q.tz);
  const span = sql.raw(`interval '${r.span}'`);
  const unit = sql.raw(`'${r.unit}'`);
  const step = sql.raw(`interval '${r.step}'`);
  const fmt = sql.raw(`'${r.format}'`);
  const project = q.project ? sql`and project_id = ${q.project}` : sql``;
  const inPeriod = sql`org_id = ${orgId} ${project} and created_at > now() - ${span}`;
  const local = (col: SQL) => sql`((${col}) at time zone ${tz}::text)`;

  const breakdown = (expr: SQL, limit = 12) =>
    db.execute<Count>(sql`select ${expr} as key, count(*)::int as n from reports where ${inPeriod} group by 1 order by n desc limit ${limit}`);

  const [
    [totals],
    [previous],
    series,
    previousSeries,
    status,
    priority,
    source,
    environment,
    browser,
    os,
    device,
    country,
    pages,
    byProject,
    heat,
    deliveryStatus,
    deliverySeries,
    byProvider,
    [timing],
    [failing],
  ] = await Promise.all([
    db.execute<{ reports: number; open: number; resolved: number; with_files: number; reporters: number }>(sql`
      select count(*)::int as reports,
        count(*) filter (where status in ('new', 'investigating'))::int as open,
        count(*) filter (where status in ('resolved', 'closed'))::int as resolved,
        count(*) filter (where exists (select 1 from attachments a where a.report_id = reports.id))::int as with_files,
        count(distinct reporter_email)::int as reporters
      from reports where ${inPeriod}`),
    db.execute<{ reports: number }>(sql`
      select count(*)::int as reports from reports
      where org_id = ${orgId} ${project} and created_at > now() - ${span} - ${span} and created_at <= now() - ${span}`),
    db.execute<{ bucket: string; low: number; medium: number; high: number; critical: number }>(sql`
      with b as (
        select generate_series(date_trunc(${unit}, ${local(sql`now() - ${span}`)}), date_trunc(${unit}, ${local(sql`now()`)}), ${step}) as bucket
      )
      select to_char(b.bucket, ${fmt}) as bucket,
        count(r.id) filter (where r.priority = 'low')::int as low,
        count(r.id) filter (where r.priority = 'medium')::int as medium,
        count(r.id) filter (where r.priority = 'high')::int as high,
        count(r.id) filter (where r.priority = 'critical')::int as critical
      from b left join reports r on r.org_id = ${orgId} ${q.project ? sql`and r.project_id = ${q.project}` : sql``}
        and date_trunc(${unit}, ${local(sql`r.created_at`)}) = b.bucket and r.created_at > now() - ${span}
      group by b.bucket order by b.bucket`),
    db.execute<{ bucket: string; n: number }>(sql`
      with b as (
        select generate_series(date_trunc(${unit}, ${local(sql`now() - ${span} - ${span}`)}), date_trunc(${unit}, ${local(sql`now() - ${span}`)}), ${step}) as bucket
      )
      select to_char(b.bucket, ${fmt}) as bucket, count(r.id)::int as n
      from b left join reports r on r.org_id = ${orgId} ${q.project ? sql`and r.project_id = ${q.project}` : sql``}
        and date_trunc(${unit}, ${local(sql`r.created_at`)}) = b.bucket
        and r.created_at > now() - ${span} - ${span} and r.created_at <= now() - ${span}
      group by b.bucket order by b.bucket`),
    breakdown(sql`status`),
    breakdown(sql`priority`),
    breakdown(sql`source`),
    breakdown(sql`coalesce(nullif(environment, ''), 'none')`),
    breakdown(sql`coalesce(context->>'browser', 'Unknown')`),
    breakdown(sql`coalesce(context->>'os', 'Unknown')`),
    breakdown(sql`coalesce(context->>'device', 'Desktop')`),
    breakdown(sql`country`, 250),
    breakdown(sql`regexp_replace(split_part(split_part(page_url, '#', 1), '?', 1), '^https?://', '')`, 10),
    db.execute<{ key: string; name: string; n: number }>(sql`
      select p.id as key, p.name, count(r.id)::int as n from projects p
      left join reports r on r.project_id = p.id and r.created_at > now() - ${span}
      where p.org_id = ${orgId} ${q.project ? sql`and p.id = ${q.project}` : sql``}
      group by p.id, p.name order by n desc, p.name`),
    db.execute<{ dow: number; hour: number; n: number }>(sql`
      select extract(isodow from ${local(sql`created_at`)})::int as dow, extract(hour from ${local(sql`created_at`)})::int as hour, count(*)::int as n
      from reports where ${inPeriod} group by 1, 2`),
    db.execute<Count>(sql`select status as key, count(*)::int as n from deliveries where ${inPeriod} and not is_test group by 1`),
    db.execute<{ bucket: string; delivered: number; failed: number; waiting: number }>(sql`
      with b as (
        select generate_series(date_trunc(${unit}, ${local(sql`now() - ${span}`)}), date_trunc(${unit}, ${local(sql`now()`)}), ${step}) as bucket
      )
      select to_char(b.bucket, ${fmt}) as bucket,
        count(x.id) filter (where x.status = 'delivered')::int as delivered,
        count(x.id) filter (where x.status = 'failed')::int as failed,
        count(x.id) filter (where x.status in ('pending', 'delivering', 'retrying'))::int as waiting
      from b left join deliveries x on x.org_id = ${orgId} ${q.project ? sql`and x.project_id = ${q.project}` : sql``} and not x.is_test
        and date_trunc(${unit}, ${local(sql`x.created_at`)}) = b.bucket and x.created_at > now() - ${span}
      group by b.bucket order by b.bucket`),
    db.execute<{ key: string; delivered: number; failed: number }>(sql`
      select d.provider as key,
        count(*) filter (where x.status = 'delivered')::int as delivered,
        count(*) filter (where x.status = 'failed')::int as failed
      from deliveries x join destinations d on d.id = x.destination_id
      where x.org_id = ${orgId} ${q.project ? sql`and x.project_id = ${q.project}` : sql``} and not x.is_test and x.created_at > now() - ${span}
      group by 1 order by count(*) desc limit 12`),
    db.execute<{ avg: number | null; p50: number | null; p95: number | null }>(sql`
      select avg(duration_ms)::int as avg,
        percentile_cont(0.5) within group (order by duration_ms)::int as p50,
        percentile_cont(0.95) within group (order by duration_ms)::int as p95
      from deliveries where ${inPeriod} and not is_test and status = 'delivered' and duration_ms is not null`),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from destinations d
      left join connections cn on cn.id = d.connection_id
      where d.org_id = ${orgId} ${q.project ? sql`and d.project_id = ${q.project}` : sql``} and d.enabled
        and (cn.status = 'error' or (
          select x.status from deliveries x where x.destination_id = d.id and not x.is_test and x.status in ('delivered', 'failed')
          order by x.updated_at desc limit 1) = 'failed')`),
  ]);

  const counts = (rows: Count[]) => rows.filter((r) => r.key !== null).map((r) => ({ key: r.key as string, n: r.n }));
  const deliveries = Object.fromEntries(deliveryStatus.map((d) => [d.key, d.n])) as Record<string, number>;

  return c.json({
    range: q.range,
    unit: r.unit,
    timezone: tz,
    totals: {
      reports: totals.reports,
      previousReports: previous.reports,
      open: totals.open,
      resolved: totals.resolved,
      withAttachments: totals.with_files,
      reporters: totals.reporters,
      delivered: deliveries.delivered ?? 0,
      failed: deliveries.failed ?? 0,
      waiting: (deliveries.pending ?? 0) + (deliveries.delivering ?? 0) + (deliveries.retrying ?? 0),
      avgDeliveryMs: timing?.avg ?? null,
      p50DeliveryMs: timing?.p50 ?? null,
      p95DeliveryMs: timing?.p95 ?? null,
      failingDestinations: failing?.n ?? 0,
    },
    series: series.map((s) => ({ bucket: s.bucket, low: s.low, medium: s.medium, high: s.high, critical: s.critical })),
    previousSeries: previousSeries.map((s) => s.n),
    deliverySeries,
    breakdowns: {
      status: counts(status),
      priority: counts(priority),
      source: counts(source),
      environment: counts(environment),
      browser: counts(browser),
      os: counts(os),
      device: counts(device),
      country: counts(country),
      page: counts(pages).filter((p) => p.key),
      project: byProject.map((p) => ({ key: p.key, name: p.name, n: p.n })),
      provider: byProvider,
    },
    heatmap: heat,
  });
});
