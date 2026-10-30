import { eq } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { safeEqual, sign } from "../lib/crypto";
import { newId } from "../lib/ids";
import type { ReportPayload } from "../integrations/types";
import type { WebhookEvent } from "../db/schema";

type Report = typeof schema.reports.$inferSelect;
type Attachment = typeof schema.attachments.$inferSelect;

/**
 * Attachment links that work without signing in, so an issue in GitHub or a
 * Discord message can show the screenshot. They expire after ATTACHMENT_LINK_DAYS.
 */
export function signedAttachmentUrl(a: Pick<Attachment, "id" | "filename">) {
  const exp = Math.floor(Date.now() / 1000) + config.limits.attachmentLinkDays * 86400;
  const sig = sign(`${a.id}.${exp}`);
  return `${config.appUrl}/a/${a.id}/${encodeURIComponent(a.filename)}?exp=${exp}&sig=${sig}`;
}

export function verifyAttachmentSignature(id: string, exp: string | undefined, sig: string | undefined) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sign(`${id}.${exp}`), sig);
}

export const dashboardReportUrl = (id: string) => `${config.appUrl}/inbox/${id}`;

export function toPayload(report: Report, project: { id: string; name: string }, attachments: Attachment[], group?: { id: string; count: number } | null): ReportPayload {
  return {
    id: report.id,
    number: report.number,
    title: report.title,
    description: report.description,
    status: report.status,
    priority: report.priority,
    source: report.source,
    environment: report.environment,
    pageUrl: report.pageUrl,
    browser: report.browser,
    context: report.context,
    reporter: { email: report.reporterEmail, name: report.reporterName },
    metadata: report.metadata,
    diagnostics: report.diagnostics ?? {},
    attachments: attachments.map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes, url: signedAttachmentUrl(a) })),
    group: group ?? null,
    project,
    dashboardUrl: dashboardReportUrl(report.id),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export async function loadReportPayload(reportId: string): Promise<ReportPayload | null> {
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, reportId) });
  if (!report) return null;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, report.projectId), columns: { id: true, name: true } });
  const attachments = await db.query.attachments.findMany({ where: eq(schema.attachments.reportId, reportId), orderBy: schema.attachments.createdAt });
  const lead = report.groupId ? await db.query.reports.findFirst({ where: eq(schema.reports.id, report.groupId), columns: { id: true, duplicateCount: true } }) : null;
  return toPayload(report, project!, attachments, lead ? { id: lead.id, count: lead.duplicateCount + 1 } : null);
}

/** The public, snake_case shape used by the REST API and webhooks. */
export function publicReport(r: ReportPayload) {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    source: r.source,
    environment: r.environment,
    page_url: r.pageUrl,
    browser: r.browser,
    context: r.context,
    reporter: r.reporter,
    metadata: r.metadata,
    diagnostics: r.diagnostics,
    attachments: r.attachments.map((a) => ({ id: a.id, filename: a.filename, content_type: a.contentType, size_bytes: a.sizeBytes, url: a.url })),
    group: r.group ? { report_id: r.group.id, count: r.group.count } : null,
    project: r.project,
    dashboard_url: r.dashboardUrl,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function eventEnvelope(event: WebhookEvent, report: ReportPayload, test = false) {
  return {
    id: newId("evt"),
    type: event,
    created_at: new Date().toISOString(),
    ...(test ? { test: true } : {}),
    data: { report: publicReport(report) },
  };
}

/** A believable report for "Send test", clearly marked as a test. */
export function testReport(project: { id: string; name: string }): ReportPayload {
  const now = new Date().toISOString();
  return {
    id: "rep_test",
    number: 0,
    title: "Test report from Issueit",
    description: "This is a test sent from Issueit to check this destination works. You can delete it.",
    status: "new",
    priority: "medium",
    source: "test",
    environment: "test",
    pageUrl: `${config.appUrl}/projects/${project.id}`,
    browser: null,
    context: {},
    reporter: { email: null, name: null },
    metadata: {},
    diagnostics: {
      console: [{ t: 4200, level: "error", message: "TypeError: Cannot read properties of undefined (reading 'total')", stack: "at Cart.render (cart.js:41:12)" }],
      network: [{ t: 4300, method: "POST", url: "https://example.com/api/cart", status: 500, ms: 182 }],
      steps: [
        { t: 9000, kind: "navigate", label: "/cart" },
        { t: 4500, kind: "click", label: 'button "Checkout"' },
      ],
    },
    attachments: [],
    group: null,
    project,
    dashboardUrl: `${config.appUrl}/projects/${project.id}/integrations`,
    createdAt: now,
    updatedAt: now,
  };
}
