import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { emailsWithDefaults, widgetWithDefaults, type Priority, type ReportContext } from "../db/schema";
import { keyedHash, sha256 } from "../lib/crypto";
import { AppError, badRequest, notFound, tooMany } from "../lib/errors";
import { publish } from "../lib/events";
import { newId } from "../lib/ids";
import { hitAll, type Limit } from "../lib/ratelimit";
import { storage } from "../lib/storage";
import { describeUserAgent } from "../lib/useragent";
import { reportCountry } from "../lib/geo";
import { clientIp, parse } from "../http";
import { allowanceFor, countedOne, limitsFor, noteRefusal, warnAboutUsage } from "../billing/entitlements";
import { enqueueDuplicate, enqueueReportEvent } from "../delivery/queue";
import { queueReceipt } from "../mail/outbox";
import { notifyAboutReport } from "../mail/notify";
import { cleanDiagnostics } from "./diagnostics";
import { cleanFilename, sniff } from "./files";
import { fingerprintFor } from "./grouping";
import { isBrowserToken, MAX_TOKEN_SECONDS, mintBrowserToken, readBrowserToken } from "./browser-token";
import { matchesRule } from "../delivery/queue";
import { getProvider } from "../integrations";

/**
 * The ingestion API: POST /v1/{project_id}/reports. Kept apart from the
 * dashboard so it could run as its own process. The project id is public
 * and only identifies the project; whether a submission is allowed is
 * decided by the project's settings, its allowed origins and, for servers,
 * a secret key.
 */

const appOrigin = new URL(config.appUrl).origin;

const priorityAliases: Record<string, Priority> = {
  low: "low",
  minor: "low",
  trivial: "low",
  medium: "medium",
  normal: "medium",
  moderate: "medium",
  high: "high",
  major: "high",
  critical: "critical",
  urgent: "critical",
  blocker: "critical",
};

/** Reports per visitor per project per day that may ask for emails. */
const NOTIFY_PER_VISITOR_PER_DAY = 10;

const shortText = (max: number) => z.string().trim().max(max).optional().nullable();

const reportInput = z.object({
  title: z.string().trim().min(1, "Add a short title.").max(200, "Keep the title under 200 characters."),
  description: z.string().max(20000, "Keep the description under 20,000 characters.").optional().nullable(),
  severity: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  source: z
    .string()
    .trim()
    .toLowerCase()
    .max(40)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores.")
    .optional()
    .nullable(),
  environment: shortText(40),
  /** Which build this happened on, so a minified stack can be symbolicated. */
  release: shortText(80),
  /** Your own key for this submission; sending it twice files one report. */
  idempotency_key: shortText(120),
  page_url: z.string().trim().max(2000).url("Use a full URL.").optional().nullable().or(z.literal("")),
  browser: shortText(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254).optional().nullable().or(z.literal("")),
  name: shortText(80),
  reporter: z
    .object({ email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal("")), name: shortText(80) })
    .optional()
    .nullable(),
  metadata: z.record(z.string().max(100), z.unknown()).optional().nullable(),
  /** Console, requests and steps the widget saw. Cleaned leniently in diagnostics.ts. */
  diagnostics: z.unknown().optional().nullable(),
  /** Your own grouping key, e.g. an error's name and location. Reports with the same one are grouped. */
  fingerprint: z.string().trim().max(200).optional().nullable(),
  /** The reporter wants emails about this report. */
  notify: z.preprocess((v) => (typeof v === "string" ? ["true", "on", "1", "yes"].includes(v.toLowerCase()) : v), z.boolean()).optional().nullable(),
  context: z
    .object({
      userAgent: shortText(500),
      viewport: shortText(40),
      screen: shortText(40),
      language: shortText(40),
      timezone: shortText(60),
      referrer: shortText(2000),
    })
    .partial()
    .optional()
    .nullable(),
  attachments: z
    .array(z.object({ filename: z.string().max(200).optional(), content_type: z.string().max(100).optional(), data: z.string() }))
    .optional()
    .nullable(),
  /** Honeypot filled in only by bots that complete every field. */
  website: z.string().optional().nullable(),
});

type RawFile = { name?: string; data: Uint8Array };

const maxBody = config.limits.jsonBodyBytes + Math.ceil(config.limits.attachmentsPerReport * config.limits.attachmentBytes * 1.4);

function cors(c: Context) {
  const origin = c.req.header("origin");
  c.header("access-control-allow-origin", origin ?? "*");
  c.header("vary", "origin");
  c.header("access-control-allow-methods", "GET, POST, OPTIONS");
  c.header("access-control-allow-headers", "content-type, authorization");
  c.header("access-control-max-age", "86400");
}

export const ingestRoutes = new Hono()
  .use("*", async (c, next) => {
    cors(c);
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  })
  /** Public widget settings. Only the parts a page needs to draw the form. */
  .get("/:project/widget", async (c) => {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, c.req.param("project")) });
    if (!project || !project.publicSubmissions) throw notFound("That project");
    c.header("cache-control", "public, max-age=60");
    const emails = emailsWithDefaults(project.emails);
    const allowed = await attachmentLimits(project.orgId);
    return c.json({
      project: { id: project.id, name: project.name },
      widget: widgetWithDefaults(project.widget),
      emails: { updates: emails.enabled && (emails.receipt || emails.resolved) },
      limits: allowed,
    });
  })
  /** The project's logo, for the widget, the hosted form and emails. The ?v= changes with each upload. */
  .get("/:project/logo", async (c) => {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, c.req.param("project")), columns: { logo: true } });
    if (!project?.logo) throw notFound("That logo");
    let data: Buffer;
    try {
      data = await storage.read(project.logo.storageKey);
    } catch {
      throw notFound("That logo");
    }
    const current = c.req.query("v") === project.logo.hash;
    return c.body(new Uint8Array(data), 200, {
      "content-type": project.logo.contentType,
      "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "cross-origin-resource-policy": "cross-origin",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    });
  })
  /**
   * A short-lived token for a browser, minted by your own server with a
   * secret key. Lets a signed-in app send reports while the project stays
   * closed to everyone else.
   */
  .post("/:project/token", async (c) => {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, c.req.param("project")), columns: { id: true } });
    if (!project) throw notFound("That project");
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token.startsWith("sk_")) throw new AppError(401, "invalid_key", "Mint short-lived tokens from your server, with that project's secret key.");
    if (c.req.header("origin")) throw new AppError(400, "key_in_browser", "Secret keys must only be used from your server.");
    const key = await db.query.apiKeys.findFirst({ where: and(eq(schema.apiKeys.keyHash, sha256(token)), isNull(schema.apiKeys.revokedAt)) });
    if (!key || key.projectId !== project.id) throw new AppError(401, "invalid_key", "That secret key isn't valid for this project.");
    const rl = hitAll([{ key: `mint:${key.id}`, max: config.limits.reportsPerKeyPerMinute, windowMs: 60_000 }]);
    if (!rl.ok) {
      c.header("retry-after", String(rl.retryAfter));
      throw tooMany("Too many tokens minted in a short time.");
    }
    const seconds = Number(c.req.query("seconds") ?? 300);
    const { token: minted, expiresAt } = mintBrowserToken(project.id, Number.isFinite(seconds) ? seconds : 300);
    return c.json({ success: true, token: minted, expires_at: expiresAt.toISOString(), max_seconds: MAX_TOKEN_SECONDS });
  })
  .post(
    "/:project/reports",
    bodyLimit({
      maxSize: maxBody,
      onError: () => {
        throw new AppError(413, "payload_too_large", `The request is too large. Attachments can be up to ${config.limits.attachmentBytes / 1024 / 1024} MB each.`);
      },
    }),
    async (c) => {
      const projectId = c.req.param("project");
      const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw notFound("That project");

      const origin = c.req.header("origin");
      const auth = c.req.header("authorization");
      let viaKeyId: string | null = null;
      /** A short-lived token minted by the project's own server for a browser. */
      let viaBrowserToken = false;
      if (auth && isBrowserToken(auth.replace(/^Bearer\s+/i, "").trim())) {
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        const read = readBrowserToken(token);
        if (!read || read.projectId !== project.id) throw new AppError(401, "invalid_token", "That short-lived token isn't valid for this project, or it has expired. Ask your server for another.");
        viaBrowserToken = true;
      } else if (auth) {
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token.startsWith("sk_")) throw new AppError(401, "invalid_key", "That isn't a secret key. Project ids don't go in the Authorization header.");
        const key = await db.query.apiKeys.findFirst({ where: and(eq(schema.apiKeys.keyHash, sha256(token)), isNull(schema.apiKeys.revokedAt)) });
        if (!key || key.projectId !== project.id) throw new AppError(401, "invalid_key", "That secret key isn't valid for this project.");
        // A secret key in a browser is a leaked key.
        if (origin && origin !== appOrigin) throw new AppError(400, "key_in_browser", "Secret keys must only be used from your server. Use the project id alone in browsers.");
        viaKeyId = key.id;
        if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
          await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, key.id));
        }
      }
      if (!auth) {
        if (!project.publicSubmissions) throw new AppError(403, "public_disabled", "This project only accepts reports sent with a secret key, or a short-lived token from your server.");
        const allowed = project.allowedOrigins;
        if (allowed.length && origin !== appOrigin && !(origin && allowed.includes(origin))) {
          throw new AppError(403, "origin_not_allowed", "Reports from this site aren't allowed for this project.");
        }
      }

      const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, project.orgId) });
      if (!org) throw notFound("That project");
      const plan = limitsFor(org);

      const ip = keyedHash(clientIp(c));
      const limits: Limit[] = [{ key: `ingest:project:${project.id}`, max: config.limits.reportsPerProjectPerHour, windowMs: 3600_000 }];
      limits.push(
        viaKeyId
          ? { key: `ingest:key:${viaKeyId}`, max: plan.reportsPerKeyPerMinute, windowMs: 60_000 }
          : { key: `ingest:ip:${project.id}:${ip}`, max: config.limits.reportsPerIpPerMinute, windowMs: 60_000 },
      );
      const rl = hitAll(limits);
      if (!rl.ok) {
        c.header("retry-after", String(rl.retryAfter));
        throw tooMany("Too many reports in a short time. Wait a moment and try again.");
      }

      /**
       * The monthly allowance. Issueit keeps accepting a little past it,
       * because a real bug report from a real user is worth more than a
       * tidy line, and tells the owners rather than failing silently.
       */
      const allowance = await allowanceFor(org);
      if (!allowance.ok) {
        await noteRefusal(org.id, "plan_limit");
        void warnAboutUsage(org, allowance);
        c.header("retry-after", String(secondsToNextMonth()));
        throw new AppError(
          429,
          "plan_limit",
          `This organisation has used its ${allowance.limit} reports for this month. The allowance resets at the start of next month, or an owner can change plan.`,
        );
      }
      if (allowance.grace) void warnAboutUsage(org, allowance);

      const { input, files } = await readBody(c);

      /**
       * The same submission twice — a retry after a timeout, a queue that
       * delivers at least once — files one report. The key is the caller's,
       * scoped to the project.
       */
      const idempotencyKey = (c.req.header("idempotency-key") ?? input.idempotency_key ?? "").trim().slice(0, 120) || null;
      if (idempotencyKey) {
        const earlier = await db.query.reports.findFirst({
          where: and(eq(schema.reports.projectId, project.id), eq(schema.reports.idempotencyKey, idempotencyKey)),
          columns: { id: true, groupId: true },
        });
        if (earlier) {
          c.header("idempotent-replay", "true");
          return c.json({ success: true, report_id: earlier.id, message: "Report already received", duplicate: !!earlier.groupId, replayed: true }, 200);
        }
      }

      /** Says what would happen without storing anything. */
      const dryRun = ["1", "true", "yes"].includes((c.req.query("dry_run") ?? "").toLowerCase());

      if (input.website) {
        // Pretend to accept honeypot submissions so bots learn nothing.
        return c.json({ success: true, report_id: newId("rep"), message: "Report received" }, 201);
      }
      const allowed = { attachmentBytes: Math.min(plan.attachmentBytes, config.limits.attachmentBytes), attachmentsPerReport: Math.min(plan.attachmentsPerReport, config.limits.attachmentsPerReport) };
      if (files.length > allowed.attachmentsPerReport) throw badRequest(`Attach up to ${allowed.attachmentsPerReport} files.`);

      const prepared = files.map((f, i) => {
        if (f.data.byteLength > allowed.attachmentBytes) throw new AppError(413, "attachment_too_large", `${f.name ?? `Attachment ${i + 1}`} is larger than ${allowed.attachmentBytes / 1024 / 1024} MB.`);
        if (!f.data.byteLength) throw badRequest(`${f.name ?? `Attachment ${i + 1}`} is empty.`);
        const type = sniff(f.data);
        if (!type) throw new AppError(415, "unsupported_attachment", `${f.name ?? `Attachment ${i + 1}`} isn't a supported file type. Use an image, video, PDF, text file or zip.`);
        return { id: newId("att"), filename: cleanFilename(f.name, type.ext), contentType: type.contentType, data: f.data };
      });

      if (config.limits.storageBytes && prepared.length) {
        const [row] = await db.execute<{ bytes: number }>(sql`select coalesce(sum(size_bytes), 0)::bigint as bytes from attachments where org_id = ${project.orgId}`);
        const incoming = prepared.reduce((n, f) => n + f.data.byteLength, 0);
        if (Number(row.bytes) + incoming > config.limits.storageBytes) {
          await noteRefusal(org.id, "storage_limit");
          throw new AppError(507, "storage_full", "This organisation has used all of its attachment storage.");
        }
      }

      const ua = c.req.header("user-agent");
      const context: ReportContext = { ...Object.fromEntries(Object.entries(input.context ?? {}).filter(([, v]) => v)) };
      const fromWidget = input.context?.userAgent ?? (origin ? ua : undefined);
      if (fromWidget) Object.assign(context, { userAgent: fromWidget.slice(0, 500) }, describeUserAgent(fromWidget));


      const country = reportCountry(c, context.timezone, org?.settings.location);

      const metadata = input.metadata ?? {};
      if (JSON.stringify(metadata).length > 16_384) throw badRequest("metadata: Keep metadata under 16 KB.");
      const diagnostics = cleanDiagnostics(input.diagnostics, project.rules.redaction?.patterns);
      const pageUrl = input.page_url || null;
      const fingerprint = fingerprintFor({ fingerprint: input.fingerprint, title: input.title, pageUrl }, project.rules.grouping);
      const reporterEmail = input.reporter?.email || input.email || null;
      // Emails go to whatever address is typed in, so one visitor can only ask for a few a day.
      let notifyReporter = !!input.notify && !!reporterEmail;
      if (notifyReporter && !viaKeyId) {
        const [row] = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from reports
          where project_id = ${project.id} and ip_hash = ${ip} and notify_reporter and created_at > now() - interval '1 day'`);
        if (row.n >= NOTIFY_PER_VISITOR_PER_DAY) notifyReporter = false;
      }

      const reportId = newId("rep");
      const priority = priorityAliases[(input.priority ?? input.severity ?? "medium").toLowerCase()] ?? "medium";
      const source = input.source || (viaKeyId ? "api" : origin === appOrigin ? "form" : origin || viaBrowserToken ? "widget" : "api");

      if (dryRun) {
        const [openGroup] = fingerprint && project.groupDuplicates
          ? await db
              .select({ id: schema.reports.id, number: schema.reports.number, title: schema.reports.title, duplicateCount: schema.reports.duplicateCount })
              .from(schema.reports)
              .where(
                and(
                  eq(schema.reports.projectId, project.id),
                  eq(schema.reports.fingerprint, fingerprint),
                  isNull(schema.reports.groupId),
                  sql`${schema.reports.status} in ('new', 'investigating')`,
                ),
              )
              .limit(1)
          : [];
        const destinations = await db.query.destinations.findMany({ where: and(eq(schema.destinations.projectId, project.id), eq(schema.destinations.enabled, true)) });
        const shaped = { priority, source, environment: input.environment || null };
        const routed = destinations.map((d) => {
          const provider = getProvider(d.provider);
          const wouldDeliver = !!provider && provider.events.includes("report.created") && d.events.includes("report.created") && matchesRule(d.rule, shaped);
          return {
            id: d.id,
            name: d.name,
            provider: d.provider,
            would_deliver: wouldDeliver && !openGroup,
            // A duplicate isn't delivered again; the tracker may get a comment instead.
            why: !wouldDeliver ? "the destination's rule doesn't match this report" : openGroup ? "this report would join an open group, so it isn't delivered again" : null,
          };
        });
        return c.json({
          success: true,
          dry_run: true,
          report: { title: input.title, priority, source, environment: shaped.environment, page_url: pageUrl, release: input.release ?? null, country },
          fingerprint,
          duplicate_of: openGroup ? { id: openGroup.id, number: openGroup.number, title: openGroup.title, seen: openGroup.duplicateCount + 1 } : null,
          diagnostics,
          attachments: prepared.map((f) => ({ filename: f.filename, content_type: f.contentType, size_bytes: f.data.byteLength })),
          destinations: routed,
          would_email: !!notifyReporter,
          message: "Nothing was stored.",
        });
      }
      const written: string[] = [];
      let report: typeof schema.reports.$inferSelect;
      let lead: typeof schema.reports.$inferSelect | null = null;
      try {
        for (const f of prepared) {
          const key = `${project.orgId}/${project.id}/${reportId}/${f.id}`;
          await storage.put(key, f.data);
          written.push(key);
        }
        report = await db.transaction(async (tx) => {
          const [seq] = await tx
            .update(schema.projects)
            .set({ reportSeq: sql`${schema.projects.reportSeq} + 1`, lastReportAt: new Date() })
            .where(eq(schema.projects.id, project.id))
            .returning({ n: schema.projects.reportSeq });
          // The same bug, still open: join its group. The lock keeps two at once from both starting one.
          if (fingerprint && project.groupDuplicates) {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${project.id}:${fingerprint}`}))`);
            const [open] = await tx
              .select()
              .from(schema.reports)
              .where(and(eq(schema.reports.projectId, project.id), eq(schema.reports.fingerprint, fingerprint), isNull(schema.reports.groupId), sql`${schema.reports.status} in ('new', 'investigating')`))
              .orderBy(sql`${schema.reports.createdAt} desc`)
              .limit(1);
            if (open) {
              // Re-checked here: if it was resolved a moment ago, this report starts a new group instead.
              [lead = null] = await tx
                .update(schema.reports)
                .set({ duplicateCount: sql`${schema.reports.duplicateCount} + 1`, lastSeenAt: new Date() })
                .where(and(eq(schema.reports.id, open.id), sql`${schema.reports.status} in ('new', 'investigating')`))
                .returning();
            }
          }
          const [row] = await tx
            .insert(schema.reports)
            .values({
              id: reportId,
              orgId: project.orgId,
              projectId: project.id,
              number: seq.n,
              title: input.title,
              description: input.description?.trim() ?? "",
              priority,
              status: lead?.status ?? "new",
              source,
              environment: input.environment || null,
              release: input.release || null,
              idempotencyKey,
              pageUrl,
              browser: input.browser || context.browser || null,
              context,
              country,
              reporterEmail,
              reporterName: input.reporter?.name || input.name || null,
              metadata,
              diagnostics,
              notifyReporter,
              fingerprint,
              groupId: lead?.id ?? null,
              ipHash: ip,
              viaKeyId,
            })
            .returning();
          if (prepared.length) {
            await tx.insert(schema.attachments).values(
              prepared.map((f, i) => ({
                id: f.id,
                orgId: project.orgId,
                projectId: project.id,
                reportId,
                filename: f.filename,
                contentType: f.contentType,
                sizeBytes: f.data.byteLength,
                storageKey: written[i],
              })),
            );
          }
          return row;
        });
      } catch (err) {
        await Promise.all(written.map((k) => storage.remove(k).catch(() => {})));
        throw err;
      }

      countedOne(org.id);
      // Telling someone it arrived, if anyone asked to hear about it.
      void notifyAboutReport(report, project).catch((err) => console.error("[ingest] couldn't send notifications for", report.id, err));

      // The report is stored. Queueing delivery and email can fail without losing it.
      try {
        if (lead) await enqueueDuplicate(lead, report);
        else await enqueueReportEvent(report, "report.created");
      } catch (err) {
        console.error("[ingest] couldn't queue deliveries for", report.id, err);
      }
      try {
        await queueReceipt(report, project);
      } catch (err) {
        console.error("[ingest] couldn't queue the receipt for", report.id, err);
      }
      await publish({ type: "report.created", orgId: report.orgId, projectId: report.projectId, reportId: report.id }).catch(() => {});
      return c.json({ success: true, report_id: report.id, message: "Report received", duplicate: !!lead }, 201);
    },
  );

/** What the widget should say it accepts: the plan's limit, under the operator's. */
async function attachmentLimits(orgId: string) {
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, orgId) });
  const plan = org ? limitsFor(org) : config.limits;
  return {
    attachmentBytes: Math.min(plan.attachmentBytes, config.limits.attachmentBytes),
    attachmentsPerReport: Math.min(plan.attachmentsPerReport, config.limits.attachmentsPerReport),
  };
}

/** How long until the allowance resets, for a Retry-After someone can act on. */
function secondsToNextMonth(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(60, Math.round((next - now.getTime()) / 1000));
}

async function readBody(c: Context): Promise<{ input: z.infer<typeof reportInput>; files: RawFile[] }> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = await c.req.parseBody({ all: true });
    } catch {
      throw badRequest("The form data couldn't be read.");
    }
    const files: RawFile[] = [];
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        if (typeof v !== "string") files.push({ name: v.name, data: new Uint8Array(await v.arrayBuffer()) });
        else if (key === "report") Object.assign(fields, safeJson(v));
        else if (key === "metadata" || key === "context" || key === "diagnostics") fields[key] = safeJson(v);
        else fields[key.replace(/\[\]$/, "")] = v;
      }
    }
    return { input: parse(reportInput, fields), files };
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Send the report as JSON or multipart form data.");
  }
  const input = parse(reportInput, raw);
  const files = (input.attachments ?? []).map((a) => {
    const data = Buffer.from(a.data.replace(/^data:[^;]+;base64,/, ""), "base64");
    return { name: a.filename, data: new Uint8Array(data) };
  });
  return { input, files };
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw badRequest("A JSON field in the form couldn't be read.");
}
