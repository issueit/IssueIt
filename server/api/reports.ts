import { Hono } from "hono";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { priorities, reportStatuses } from "../db/schema";
import { publish } from "../lib/events";
import { enqueueStatusChange } from "../delivery/queue";
import { badRequest, notFound } from "../lib/errors";
import { storage } from "../lib/storage";
import { body, parse, type AppEnv } from "../http";
import { enqueueReportEvent } from "../delivery/queue";
import { setReportStatus } from "../reports/status";

const listQuery = z.object({
  project: z.string().optional(),
  status: z.enum([...reportStatuses, "open", "all"]).default("all"),
  priority: z.enum(priorities).optional(),
  q: z.string().trim().max(200).optional(),
  delivery: z.enum(["failed"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Cursor: "<createdAt ISO>|<id>", so paging stays stable as reports arrive. */
function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(at);
  if (!id || Number.isNaN(date.getTime())) throw badRequest("That page link is no longer valid.");
  return { date, id };
}

const encodeCursor = (date: Date, id: string) => Buffer.from(`${date.toISOString()}|${id}`).toString("base64url");

export const reportRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const query = parse(listQuery, c.req.query());
    const orgId = c.get("orgId");
    const r = schema.reports;
    // Duplicates are listed under the report they joined, not on their own.
    const where: SQL[] = [eq(r.orgId, orgId), isNull(r.groupId)];
    if (query.project) where.push(eq(r.projectId, query.project));
    if (query.status === "open") where.push(sql`${r.status} in ('new', 'investigating')`);
    else if (query.status !== "all") where.push(eq(r.status, query.status));
    if (query.priority) where.push(eq(r.priority, query.priority));
    if (query.q) {
      const like = `%${query.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      where.push(sql`(${r.title} ilike ${like} or ${r.description} ilike ${like} or ${r.reporterEmail} ilike ${like} or ${r.id} = ${query.q})`);
    }
    if (query.delivery === "failed") where.push(sql`exists (select 1 from deliveries d where d.report_id = ${r.id} and d.status = 'failed')`);
    const cursor = decodeCursor(query.cursor);
    if (cursor) where.push(sql`(${r.createdAt}, ${r.id}) < (${cursor.date.toISOString()}::timestamptz, ${cursor.id})`);

    const rows = await db
      .select({
        id: r.id,
        number: r.number,
        title: r.title,
        status: r.status,
        priority: r.priority,
        source: r.source,
        environment: r.environment,
        reporterEmail: r.reporterEmail,
        createdAt: r.createdAt,
        duplicateCount: r.duplicateCount,
        lastSeenAt: r.lastSeenAt,
        projectId: r.projectId,
        projectName: schema.projects.name,
        attachmentCount: sql<number>`(select count(*)::int from attachments a where a.report_id = ${r.id})`,
        delivered: sql<number>`(select count(*)::int from deliveries d where d.report_id = ${r.id} and d.status = 'delivered' and not d.is_test)`,
        failed: sql<number>`(select count(*)::int from deliveries d where d.report_id = ${r.id} and d.status = 'failed')`,
        pending: sql<number>`(select count(*)::int from deliveries d where d.report_id = ${r.id} and d.status in ('pending', 'delivering', 'retrying'))`,
      })
      .from(r)
      .innerJoin(schema.projects, eq(schema.projects.id, r.projectId))
      .where(and(...where))
      .orderBy(desc(r.createdAt), desc(r.id))
      .limit(query.limit + 1);

    const more = rows.length > query.limit;
    const page = more ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return c.json({ reports: page, nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null });
  })
  .get("/:id", async (c) => {
    const report = await loadReport(c.get("orgId"), c.req.param("id"));
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, report.projectId), columns: { id: true, name: true } });
    const attachments = await db.query.attachments.findMany({ where: eq(schema.attachments.reportId, report.id), orderBy: schema.attachments.createdAt });
    const deliveries = await db
      .select({
        id: schema.deliveries.id,
        event: schema.deliveries.event,
        status: schema.deliveries.status,
        attempts: schema.deliveries.attempts,
        lastError: schema.deliveries.lastError,
        externalId: schema.deliveries.externalId,
        externalUrl: schema.deliveries.externalUrl,
        externalState: schema.deliveries.externalState,
        nextAttemptAt: schema.deliveries.nextAttemptAt,
        deliveredAt: schema.deliveries.deliveredAt,
        createdAt: schema.deliveries.createdAt,
        destinationId: schema.destinations.id,
        destinationName: schema.destinations.name,
        provider: schema.destinations.provider,
      })
      .from(schema.deliveries)
      .innerJoin(schema.destinations, eq(schema.destinations.id, schema.deliveries.destinationId))
      .where(eq(schema.deliveries.reportId, report.id))
      .orderBy(schema.deliveries.createdAt);
    const brief = { id: schema.reports.id, number: schema.reports.number, title: schema.reports.title, status: schema.reports.status, duplicateCount: schema.reports.duplicateCount };
    const [group] = report.groupId ? await db.select(brief).from(schema.reports).where(eq(schema.reports.id, report.groupId)) : [];
    const duplicates = report.groupId
      ? []
      : await db
          .select({
            id: schema.reports.id,
            number: schema.reports.number,
            title: schema.reports.title,
            reporterEmail: schema.reports.reporterEmail,
            reporterName: schema.reports.reporterName,
            pageUrl: schema.reports.pageUrl,
            browser: schema.reports.browser,
            createdAt: schema.reports.createdAt,
          })
          .from(schema.reports)
          .where(eq(schema.reports.groupId, report.id))
          .orderBy(desc(schema.reports.createdAt))
          .limit(100);
    const emails = await db
      .select({ id: schema.emails.id, kind: schema.emails.kind, to: schema.emails.to, status: schema.emails.status, lastError: schema.emails.lastError, sentAt: schema.emails.sentAt, createdAt: schema.emails.createdAt })
      .from(schema.emails)
      .where(eq(schema.emails.reportId, report.id))
      .orderBy(asc(schema.emails.createdAt));
    const { ipHash: _ip, viaKeyId: _key, fingerprint: _fp, ...safe } = report;
    return c.json({
      report: { ...safe, project },
      attachments: attachments.map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes, createdAt: a.createdAt })),
      deliveries,
      group: group ?? null,
      duplicates,
      emails,
    });
  })
  .patch("/:id", async (c) => {
    const input = await body(c, z.object({ status: z.enum(reportStatuses).optional(), priority: z.enum(priorities).optional() }));
    const report = await loadReport(c.get("orgId"), c.req.param("id"));
    if (!input.status && !input.priority) return c.json({ report });
    let updated = report;
    if (input.priority && input.priority !== report.priority) {
      [updated] = await db.update(schema.reports).set({ priority: input.priority, updatedAt: new Date() }).where(eq(schema.reports.id, report.id)).returning();
      if (!input.status || input.status === report.status) {
        await enqueueStatusChange(updated, report.status);
        await publish({ type: "report.updated", orgId: updated.orgId, projectId: updated.projectId, reportId: updated.id });
      }
    }
    if (input.status) updated = await setReportStatus(updated, input.status);
    return c.json({ report: updated });
  })
  /** Puts a report into another report's group by hand, e.g. when two people described the same bug differently. */
  .post("/:id/group", async (c) => {
    const input = await body(c, z.object({ into: z.number().int().min(1) }));
    const report = await loadReport(c.get("orgId"), c.req.param("id"));
    let target = await db.query.reports.findFirst({ where: and(eq(schema.reports.projectId, report.projectId), eq(schema.reports.number, input.into)) });
    if (!target) throw notFound(`Report #${input.into}`);
    if (target.groupId) target = (await db.query.reports.findFirst({ where: eq(schema.reports.id, target.groupId) })) ?? target;
    if (target.id === report.id || target.id === report.groupId) throw badRequest(`This report is already part of #${target.number}.`);
    await db.transaction(async (tx) => {
      // Its own duplicates come along, and it leaves any group it was in.
      if (report.groupId) await tx.update(schema.reports).set({ duplicateCount: sql`greatest(${schema.reports.duplicateCount} - 1, 0)` }).where(eq(schema.reports.id, report.groupId));
      await tx.update(schema.reports).set({ groupId: target.id, duplicateCount: 0, status: target.status, updatedAt: new Date() }).where(eq(schema.reports.groupId, report.id));
      await tx.update(schema.reports).set({ groupId: target.id, duplicateCount: 0, status: target.status, updatedAt: new Date() }).where(eq(schema.reports.id, report.id));
      await tx
        .update(schema.reports)
        .set({ duplicateCount: sql`(select count(*)::int from reports d where d.group_id = ${target.id})`, lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.reports.id, target.id));
    });
    await publish({ type: "report.updated", orgId: report.orgId, projectId: report.projectId, reportId: target.id });
    return c.json({ ok: true, groupId: target.id });
  })
  /** Takes a duplicate out of its group. It was never delivered, so it's sent to destinations now. */
  .post("/:id/separate", async (c) => {
    const report = await loadReport(c.get("orgId"), c.req.param("id"));
    if (!report.groupId) throw badRequest("This report isn't part of a group.");
    const [updated] = await db.update(schema.reports).set({ groupId: null, fingerprint: null, updatedAt: new Date() }).where(eq(schema.reports.id, report.id)).returning();
    await db.update(schema.reports).set({ duplicateCount: sql`greatest(${schema.reports.duplicateCount} - 1, 0)` }).where(eq(schema.reports.id, report.groupId));
    await enqueueReportEvent(updated, "report.created");
    await publish({ type: "report.updated", orgId: report.orgId, projectId: report.projectId, reportId: report.id });
    return c.json({ report: updated });
  })
  .delete("/:id", async (c) => {
    const report = await loadReport(c.get("orgId"), c.req.param("id"));
    await db.transaction(async (tx) => {
      // Same lock as ingestion, so a report arriving now can't join a group that's being handed over.
      if (report.fingerprint) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${report.projectId}:${report.fingerprint}`}))`);
      if (!report.groupId) {
        // The oldest duplicate takes over the group, and the issues already opened for it, so the rest don't scatter.
        const [next] = await tx.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.groupId, report.id)).orderBy(asc(schema.reports.createdAt)).limit(1);
        if (next) {
          await tx.update(schema.reports).set({ groupId: next.id }).where(and(eq(schema.reports.groupId, report.id), sql`${schema.reports.id} <> ${next.id}`));
          await tx
            .update(schema.reports)
            .set({ groupId: null, duplicateCount: sql`(select count(*)::int from reports d where d.group_id = ${next.id})`, lastSeenAt: report.lastSeenAt })
            .where(eq(schema.reports.id, next.id));
          await tx.update(schema.deliveries).set({ reportId: next.id }).where(and(eq(schema.deliveries.reportId, report.id), eq(schema.deliveries.event, "report.created")));
        }
      } else {
        await tx.update(schema.reports).set({ duplicateCount: sql`greatest(${schema.reports.duplicateCount} - 1, 0)` }).where(eq(schema.reports.id, report.groupId));
      }
      await tx.delete(schema.reports).where(eq(schema.reports.id, report.id));
    });
    await storage.removePrefix(`${report.orgId}/${report.projectId}/${report.id}`).catch(() => {});
    await publish({ type: "report.deleted", orgId: report.orgId, projectId: report.projectId, reportId: report.id });
    return c.json({ ok: true });
  });

/** Attachment downloads for signed-in members. */
export const attachmentRoutes = new Hono<AppEnv>().get("/:id", async (c) => {
  const a = await db.query.attachments.findFirst({
    where: and(eq(schema.attachments.id, c.req.param("id")), eq(schema.attachments.orgId, c.get("orgId"))),
  });
  if (!a) throw notFound("That attachment");
  return streamAttachment(a, c.req.query("download") === "1");
});

const inlineTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "application/pdf", "text/plain"]);

/** Serves a stored file. Only known-safe types display inline; everything is sandboxed. */
export async function streamAttachment(a: typeof schema.attachments.$inferSelect, download = false) {
  let stream: ReadableStream;
  try {
    stream = await storage.stream(a.storageKey);
  } catch {
    throw notFound("That file");
  }
  const inline = !download && inlineTypes.has(a.contentType);
  const name = encodeURIComponent(a.filename);
  return new Response(stream, {
    headers: {
      "content-type": inline ? a.contentType : "application/octet-stream",
      "content-length": String(a.sizeBytes),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}

async function loadReport(orgId: string, id: string) {
  const report = await db.query.reports.findFirst({ where: and(eq(schema.reports.id, id), eq(schema.reports.orgId, orgId)) });
  if (!report) throw notFound("That report");
  return report;
}
