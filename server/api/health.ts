import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { safeEqual } from "../lib/crypto";
import { projectFence } from "../auth/tokens";
import type { AppEnv } from "../http";

/**
 * Whether the pipeline is keeping up. Delivery is an outbox, so the question
 * that matters isn't "is the server running" but "how old is the oldest
 * thing still waiting", which is what both of these answer.
 */

type Row = {
  pending: number;
  retrying: number;
  failed_day: number;
  delivered_day: number;
  oldest_pending_seconds: number | null;
  paused: number;
  destinations: number;
  emails_pending: number;
  emails_failed_day: number;
  reports_day: number;
};

async function snapshot(orgId: string, projects: string[] | null): Promise<Row> {
  const fence = !projects ? sql`` : projects.length ? sql`and project_id in (${sql.join(projects.map((id) => sql`${id}`), sql`, `)})` : sql`and false`;
  const [row] = await db.execute<Row>(sql`
    select
      (select count(*)::int from deliveries where org_id = ${orgId} ${fence} and status in ('pending', 'delivering')) as pending,
      (select count(*)::int from deliveries where org_id = ${orgId} ${fence} and status = 'retrying') as retrying,
      (select count(*)::int from deliveries where org_id = ${orgId} ${fence} and status = 'failed' and created_at > now() - interval '1 day') as failed_day,
      (select count(*)::int from deliveries where org_id = ${orgId} ${fence} and status = 'delivered' and not is_test and created_at > now() - interval '1 day') as delivered_day,
      (select extract(epoch from now() - min(created_at))::int from deliveries where org_id = ${orgId} ${fence} and status in ('pending', 'delivering', 'retrying')) as oldest_pending_seconds,
      (select count(*)::int from destinations where org_id = ${orgId} ${fence} and paused_reason is not null) as paused,
      (select count(*)::int from destinations where org_id = ${orgId} ${fence} and enabled) as destinations,
      (select count(*)::int from emails where org_id = ${orgId} ${fence} and status in ('pending', 'sending')) as emails_pending,
      (select count(*)::int from emails where org_id = ${orgId} ${fence} and status = 'failed' and created_at > now() - interval '1 day') as emails_failed_day,
      (select count(*)::int from reports where org_id = ${orgId} ${fence} and created_at > now() - interval '1 day') as reports_day`);
  return row;
}

/**
 * A judgement, not just numbers: something to point an alert at. "degraded"
 * means work is moving but some of it is failing; "behind" means the queue
 * is not draining, which is the one worth waking someone for.
 */
export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const row = await snapshot(c.get("orgId"), projectFence(c));
  const oldest = row.oldest_pending_seconds ?? 0;
  const attempted = row.delivered_day + row.failed_day;
  const failureRate = attempted ? row.failed_day / attempted : 0;

  const problems: string[] = [];
  if (oldest > 900) problems.push(`A delivery has been waiting ${Math.round(oldest / 60)} minutes.`);
  if (row.paused) problems.push(`${row.paused} destination${row.paused === 1 ? " is" : "s are"} paused after repeated failures.`);
  if (failureRate > 0.25 && row.failed_day > 5) problems.push(`${Math.round(failureRate * 100)}% of deliveries failed in the last day.`);
  if (row.emails_failed_day) problems.push(`${row.emails_failed_day} reporter email${row.emails_failed_day === 1 ? "" : "s"} failed in the last day.`);
  if (!row.destinations) problems.push("No destination is enabled, so reports are stored but nobody is told.");

  const status = oldest > 900 ? "behind" : problems.length ? "degraded" : "ok";
  return c.json({
    status,
    problems,
    deliveries: {
      pending: row.pending,
      retrying: row.retrying,
      failedLastDay: row.failed_day,
      deliveredLastDay: row.delivered_day,
      failureRate: Number(failureRate.toFixed(4)),
      oldestWaitingSeconds: row.oldest_pending_seconds,
    },
    destinations: { enabled: row.destinations, paused: row.paused },
    emails: { pending: row.emails_pending, failedLastDay: row.emails_failed_day },
    reports: { lastDay: row.reports_day },
    checkedAt: new Date().toISOString(),
  });
});

/* ------------------------------------------------------------- metrics */

const line = (name: string, help: string, type: "gauge" | "counter", value: number | null, labels = "") =>
  value === null ? "" : `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${labels} ${value}\n`;

/**
 * Prometheus metrics for the whole install, for self-hosters who already
 * have somewhere to put them. Off unless METRICS_TOKEN is set, because an
 * unauthenticated count of everyone's reports is nobody's idea of fine.
 */
export const metricsRoutes = new Hono().get("/", async (c) => {
  const expected = config.metricsToken;
  if (!expected) return c.text("Metrics are off. Set METRICS_TOKEN to turn them on.\n", 404);
  const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!given || !safeEqual(given, expected)) {
    c.header("www-authenticate", 'Bearer realm="Issueit metrics"');
    return c.text("Send METRICS_TOKEN as a bearer header.\n", 401);
  }

  const [totals] = await db.execute<{
    orgs: number;
    projects: number;
    reports: number;
    reports_hour: number;
    open: number;
    pending: number;
    retrying: number;
    failed: number;
    delivered: number;
    oldest: number | null;
    paused: number;
    emails_pending: number;
    storage: number;
  }>(sql`
    select
      (select count(*)::int from organisations) as orgs,
      (select count(*)::int from projects) as projects,
      (select count(*)::int from reports) as reports,
      (select count(*)::int from reports where created_at > now() - interval '1 hour') as reports_hour,
      (select count(*)::int from reports where status in ('new', 'investigating') and group_id is null) as open,
      (select count(*)::int from deliveries where status in ('pending', 'delivering')) as pending,
      (select count(*)::int from deliveries where status = 'retrying') as retrying,
      (select count(*)::int from deliveries where status = 'failed') as failed,
      (select count(*)::int from deliveries where status = 'delivered') as delivered,
      (select extract(epoch from now() - min(created_at))::int from deliveries where status in ('pending', 'delivering', 'retrying')) as oldest,
      (select count(*)::int from destinations where paused_reason is not null) as paused,
      (select count(*)::int from emails where status in ('pending', 'sending')) as emails_pending,
      (select coalesce(sum(size_bytes), 0)::bigint from attachments) as storage`);

  const body = [
    line("issueit_organisations", "Organisations on this install.", "gauge", totals.orgs),
    line("issueit_projects", "Projects on this install.", "gauge", totals.projects),
    line("issueit_reports_total", "Reports ever received.", "counter", totals.reports),
    line("issueit_reports_last_hour", "Reports received in the last hour.", "gauge", totals.reports_hour),
    line("issueit_reports_open", "Reports still new or being investigated.", "gauge", totals.open),
    line("issueit_deliveries_waiting", "Deliveries queued or in flight.", "gauge", totals.pending),
    line("issueit_deliveries_retrying", "Deliveries waiting for another attempt.", "gauge", totals.retrying),
    line("issueit_deliveries_failed_total", "Deliveries that gave up.", "counter", totals.failed),
    line("issueit_deliveries_delivered_total", "Deliveries that succeeded.", "counter", totals.delivered),
    line("issueit_delivery_oldest_waiting_seconds", "Age of the oldest delivery still waiting.", "gauge", totals.oldest ?? 0),
    line("issueit_destinations_paused", "Destinations Issueit paused after repeated failures.", "gauge", totals.paused),
    line("issueit_emails_waiting", "Reporter emails queued.", "gauge", totals.emails_pending),
    line("issueit_attachment_bytes", "Bytes of stored attachments.", "gauge", Number(totals.storage)),
  ].join("");
  return c.text(body, 200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
});
