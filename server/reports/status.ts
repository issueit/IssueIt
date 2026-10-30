import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../db";
import type { ReportStatus } from "../db/schema";
import { publish } from "../lib/events";
import { enqueueStatusChange } from "../delivery/queue";
import { queueResolved } from "../mail/outbox";

type Report = typeof schema.reports.$inferSelect;

/**
 * Every status change goes through here, whether someone changed it in the
 * dashboard or the issue was closed in the tracker. The first report of a
 * group carries its duplicates with it, and resolving one tells everyone who
 * reported it.
 */
export async function setReportStatus(report: Report, status: ReportStatus): Promise<Report> {
  if (report.status === status) return report;
  const now = new Date();
  const [updated] = await db
    .update(schema.reports)
    .set({ status, resolvedAt: status === "resolved" ? now : status === "closed" ? report.resolvedAt : null, updatedAt: now })
    .where(eq(schema.reports.id, report.id))
    .returning();
  if (!report.groupId) {
    // Duplicates follow quietly: their reporters hear from the email below, destinations from the first report.
    await db
      .update(schema.reports)
      .set({ status, resolvedAt: updated.resolvedAt, updatedAt: now })
      .where(and(eq(schema.reports.groupId, report.id), ne(schema.reports.status, status)));
  }
  // Destinations only ever heard about the group's first report.
  if (!report.groupId) await enqueueStatusChange(updated, report.status);
  if (status === "resolved") await queueResolved(updated);
  await publish({ type: "report.updated", orgId: updated.orgId, projectId: updated.projectId, reportId: updated.id });
  return updated;
}
