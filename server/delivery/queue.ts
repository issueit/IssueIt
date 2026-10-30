import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { RoutingRule, WebhookEvent } from "../db/schema";
import { publish } from "../lib/events";
import { newId } from "../lib/ids";
import { getProvider } from "../integrations";
import { isMilestone } from "../ingest/grouping";
import { eventEnvelope, loadReportPayload } from "./payload";
import { effectivePolicy, shapeReport } from "./policy";

type Report = typeof schema.reports.$inferSelect;

/** Empty lists mean "any". */
export function matchesRule(rule: RoutingRule, report: Pick<Report, "priority" | "source" | "environment">) {
  if (rule.priorities?.length && !rule.priorities.includes(report.priority)) return false;
  if (rule.sources?.length && !rule.sources.includes(report.source)) return false;
  if (rule.environments?.length && !rule.environments.includes(report.environment ?? "")) return false;
  return true;
}

/**
 * Writes one delivery per matching destination. The report is already
 * stored, so nothing here can lose it; the worker picks the rows up.
 * `version` distinguishes repeated update events for the same report.
 */
export async function enqueueReportEvent(report: Report, event: WebhookEvent, version = "") {
  const destinations = await db.query.destinations.findMany({
    where: and(eq(schema.destinations.projectId, report.projectId), eq(schema.destinations.enabled, true)),
  });
  const due = destinations.filter((d) => {
    const provider = getProvider(d.provider);
    return provider && provider.events.includes(event) && d.events.includes(event) && matchesRule(d.rule, report);
  });
  if (!due.length) return 0;

  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, report.orgId), columns: { settings: true } });

  // Webhooks get a frozen copy of the event so retries send identical bodies.
  const needsSnapshot = due.some((d) => d.provider === "webhook");
  const payload = needsSnapshot ? await loadReportPayload(report.id) : null;

  const rows = due.map((d) => {
    const policy = effectivePolicy(org?.settings.delivery, d.policy);
    return {
      id: newId("dlv"),
      orgId: report.orgId,
      projectId: report.projectId,
      reportId: report.id,
      destinationId: d.id,
      event,
      idempotencyKey: `${d.id}:${report.id}:${event}${version ? `:${version}` : ""}`,
      payload: d.provider === "webhook" && payload ? eventEnvelope(event, shapeReport(payload, policy)) : null,
      maxAttempts: policy.maxAttempts,
      nextAttemptAt: new Date(Date.now() + policy.sendDelaySeconds * 1000),
    };
  });
  const inserted = await db.insert(schema.deliveries).values(rows).onConflictDoNothing({ target: schema.deliveries.idempotencyKey }).returning({ id: schema.deliveries.id });
  if (inserted.length) await publish({ type: "delivery.queued", orgId: report.orgId });
  return inserted.length;
}

/**
 * A report joined an earlier one. Destinations already have the first report,
 * so they don't get this one as new: trackers get a comment on the existing
 * issue at a few group sizes, and webhooks that ask for report.duplicate get
 * every one. Routing follows the first report.
 */
export async function enqueueDuplicate(lead: Report, duplicate: Report) {
  const total = lead.duplicateCount + 1;
  const destinations = await db.query.destinations.findMany({
    where: and(eq(schema.destinations.projectId, lead.projectId), eq(schema.destinations.enabled, true)),
  });
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, lead.orgId), columns: { settings: true } });
  const payload = destinations.some((d) => d.provider === "webhook") ? await loadReportPayload(duplicate.id) : null;
  // Only destinations that have, or will have, an issue for the first report can be commented on.
  const issued = await db.execute<{ destination_id: string }>(sql`
    select distinct destination_id from deliveries
    where report_id = ${lead.id} and event = 'report.created' and not is_test and status <> 'failed'`);
  const hasIssue = new Set(issued.map((r) => r.destination_id));
  const rows: Array<typeof schema.deliveries.$inferInsert> = [];
  for (const d of destinations) {
    const provider = getProvider(d.provider);
    if (!provider || !matchesRule(d.rule, lead)) continue;
    const policy = effectivePolicy(org?.settings.delivery, d.policy);
    const base = { id: newId("dlv"), orgId: lead.orgId, projectId: lead.projectId, destinationId: d.id, event: "report.duplicate", maxAttempts: policy.maxAttempts };
    if (provider.kind === "webhook" && d.events.includes("report.duplicate") && payload) {
      rows.push({ ...base, reportId: duplicate.id, idempotencyKey: `${d.id}:${duplicate.id}:report.duplicate`, payload: eventEnvelope("report.duplicate", shapeReport(payload, policy)) });
    } else if (provider.comment && isMilestone(total) && hasIssue.has(d.id)) {
      rows.push({ ...base, reportId: lead.id, idempotencyKey: `${d.id}:${lead.id}:report.duplicate:${total}`, payload: { duplicateId: duplicate.id, count: total } });
    }
  }
  if (!rows.length) return 0;
  const inserted = await db.insert(schema.deliveries).values(rows).onConflictDoNothing({ target: schema.deliveries.idempotencyKey }).returning({ id: schema.deliveries.id });
  if (inserted.length) await publish({ type: "delivery.queued", orgId: lead.orgId });
  return inserted.length;
}

/** Status changes from the dashboard: report.updated always, plus resolved/closed when they apply. */
export async function enqueueStatusChange(report: Report, previousStatus: string) {
  const version = String(report.updatedAt.getTime());
  await enqueueReportEvent(report, "report.updated", version);
  if (report.status !== previousStatus && (report.status === "resolved" || report.status === "closed")) {
    await enqueueReportEvent(report, `report.${report.status}`, version);
  }
}
