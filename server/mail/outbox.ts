import { and, eq, inArray, or, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { emailsWithDefaults, type EmailKind, type ProjectEmailSettings } from "../db/schema";
import { decryptJson, safeEqual, sign } from "../lib/crypto";
import { publish, subscribe } from "../lib/events";
import { newId } from "../lib/ids";
import { getProvider } from "../integrations";
import { emailOf, mailers, type MailMessage } from "../integrations/catalogue/notify";
import { IntegrationError } from "../integrations/http";
import type { Credentials } from "../integrations/types";
import { smtpSend } from "./smtp";
import { brandOf, renderReporterEmail } from "./templates";

/**
 * Emails to reporters, through an outbox like deliveries: rows in Postgres,
 * claimed with SKIP LOCKED and retried with backoff, so a mail server
 * hiccup never loses the "it's fixed" note.
 */

type Report = typeof schema.reports.$inferSelect;
type Project = typeof schema.projects.$inferSelect;
type EmailRow = typeof schema.emails.$inferSelect;

const RETRIES = [60, 300, 1800, 7200, 21600];
const MAX_ATTEMPTS = RETRIES.length + 1;
/** Receipts to one address per day across the organisation. A public form shouldn't become a way to mail strangers. */
const RECEIPTS_PER_ADDRESS_PER_DAY = 5;
/** Receipts per project per hour, whatever the addresses. */
const RECEIPTS_PER_PROJECT_PER_HOUR = 200;

/* ------------------------------------------------------------------ links */

export const stopSignature = (emailId: string) => sign(`stop:${emailId}`);
export const stopUrl = (emailId: string) => `${config.appUrl}/e/${emailId}/stop?sig=${stopSignature(emailId)}`;
export const verifyStop = (emailId: string, sig: string | undefined) => !!sig && safeEqual(stopSignature(emailId), sig);

/** Turns emails off for this address on the report and the rest of its group. */
export async function stopEmails(emailId: string) {
  const row = await db.query.emails.findFirst({ where: eq(schema.emails.id, emailId) });
  if (!row) return null;
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, row.reportId), columns: { id: true, groupId: true } });
  if (!report) return row;
  const lead = report.groupId ?? report.id;
  await db
    .update(schema.reports)
    .set({ notifyReporter: false })
    .where(and(or(eq(schema.reports.id, lead), eq(schema.reports.groupId, lead), eq(schema.reports.id, report.id)), eq(schema.reports.reporterEmail, row.to)));
  const group = db.select({ id: schema.reports.id }).from(schema.reports).where(or(eq(schema.reports.id, lead), eq(schema.reports.groupId, lead)));
  await db
    .update(schema.emails)
    .set({ status: "skipped", lastError: "The reporter turned emails off.", updatedAt: new Date() })
    .where(and(eq(schema.emails.to, row.to), eq(schema.emails.status, "pending"), inArray(schema.emails.reportId, group)));
  return row;
}

/* ------------------------------------------------------------------ queueing */

const wants = (settings: ProjectEmailSettings, kind: EmailKind) => settings.enabled && settings[kind];

/** A receipt for a report that just arrived. Does nothing unless the project and the reporter both want it. */
export async function queueReceipt(report: Report, project: Project) {
  if (!report.notifyReporter || !report.reporterEmail) return;
  if (!wants(emailsWithDefaults(project.emails), "receipt")) return;
  const [recent] = await db.execute<{ address: number; project: number }>(sql`
    select
      (select count(*)::int from emails where org_id = ${report.orgId} and "to" = ${report.reporterEmail} and kind = 'receipt' and created_at > now() - interval '1 day') as address,
      (select count(*)::int from emails where project_id = ${report.projectId} and kind = 'receipt' and created_at > now() - interval '1 hour') as project`);
  const throttled =
    recent.address >= RECEIPTS_PER_ADDRESS_PER_DAY
      ? "Too many receipts to this address today."
      : recent.project >= RECEIPTS_PER_PROJECT_PER_HOUR
        ? "Too many receipts from this project in the last hour."
        : null;
  await insert([{ report, to: report.reporterEmail, kind: "receipt" }], throttled);
}

/**
 * "It's fixed" to everyone who reported it and asked for updates: the report
 * itself and, for the first report of a group, every duplicate. One email per
 * address, however many times that person reported it.
 */
export async function queueResolved(report: Report) {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, report.projectId), columns: { emails: true } });
  if (!project || !wants(emailsWithDefaults(project.emails), "resolved")) return;
  const scope = report.groupId ? eq(schema.reports.id, report.id) : or(eq(schema.reports.id, report.id), eq(schema.reports.groupId, report.id));
  const rows = await db.query.reports.findMany({
    where: and(scope, eq(schema.reports.notifyReporter, true), sql`${schema.reports.reporterEmail} is not null`),
    orderBy: schema.reports.createdAt,
  });
  const seen = new Set<string>();
  const items: Array<{ report: Report; to: string; kind: EmailKind }> = [];
  for (const r of rows) {
    const to = r.reporterEmail!;
    if (seen.has(to)) continue;
    seen.add(to);
    items.push({ report: r, to, kind: "resolved" });
  }
  await insert(items, null);
}

async function insert(items: Array<{ report: Report; to: string; kind: EmailKind }>, skipped: string | null) {
  if (!items.length) return;
  const inserted = await db
    .insert(schema.emails)
    .values(
      items.map((i) => ({
        id: newId("eml"),
        orgId: i.report.orgId,
        projectId: i.report.projectId,
        reportId: i.report.id,
        kind: i.kind,
        to: i.to,
        idempotencyKey: `${i.report.id}:${i.kind}:${i.to}`,
        status: skipped ? ("skipped" as const) : ("pending" as const),
        lastError: skipped,
      })),
    )
    .onConflictDoNothing({ target: schema.emails.idempotencyKey })
    .returning({ id: schema.emails.id });
  if (inserted.length && !skipped) await publish({ type: "email.queued", orgId: items[0].report.orgId });
}

/* ------------------------------------------------------------------ sending */

export function issueitMailAvailable() {
  return !!config.smtp.url;
}

/** "Name <address>", with the name quoted when it needs to be. */
function address(name: string, email: string) {
  const clean = name.replace(/["\\\r\n<>]/g, "").trim();
  return clean ? `"${clean}" <${email}>` : email;
}

/** Sends through the project's chosen sender. Returns which one was used. */
export async function sendAs(project: Pick<Project, "orgId" | "name" | "widget">, settings: ProjectEmailSettings, msg: Omit<MailMessage, "from">): Promise<{ via: string; id?: string }> {
  const message = { ...msg, replyTo: settings.replyTo || undefined };
  if (settings.sender === "issueit") {
    if (!config.smtp.url) throw new IntegrationError("This server has no mail server set up, so Issueit can't send email itself. Use your own email service, or set SMTP_URL.", { retryable: false });
    // Tenants choose the name, so it always says who actually sent it.
    const name = `${settings.fromName.trim() || brandOf(project).name} via Issueit`;
    const { id } = await smtpSend(config.smtp.url, { ...message, from: address(name, emailOf(config.smtp.from)) }, { trusted: true });
    return { via: "issueit", id };
  }
  if (!settings.connectionId) throw new IntegrationError("Choose the email service to send with.", { retryable: false });
  const row = await db.query.connections.findFirst({ where: and(eq(schema.connections.id, settings.connectionId), eq(schema.connections.orgId, project.orgId)) });
  if (!row) throw new IntegrationError("The email service chosen for reporter emails was disconnected. Choose another.", { retryable: false });
  const creds = decryptJson<Credentials>(row.credentials) as Record<string, string>;
  if (row.provider === "smtp") {
    const { id } = await smtpSend(creds.url, { ...message, from: creds.from });
    return { via: "smtp", id };
  }
  const mailer = mailers[row.provider];
  if (!mailer) throw new IntegrationError(`${getProvider(row.provider)?.name ?? "That service"} can't send email.`, { retryable: false });
  const { id } = await mailer(creds, { ...message, from: creds.from });
  return { via: row.provider, id };
}

function headersFor(emailId: string) {
  const url = stopUrl(emailId);
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

async function send(row: EmailRow) {
  try {
    await sendOne(row);
  } catch (err) {
    console.error("[mail]", row.id, err);
    await finish(row, { status: row.attempts < MAX_ATTEMPTS ? "pending" : "failed", lastError: "Something went wrong while preparing the email.", nextAttemptAt: new Date(Date.now() + 300_000) }).catch(() => {});
  }
}

async function sendOne(row: EmailRow) {
  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, row.reportId) });
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, row.projectId) });
  if (!report || !project) return finish(row, { status: "skipped", lastError: "The report was deleted." });
  const settings = emailsWithDefaults(project.emails);
  if (!wants(settings, row.kind)) return finish(row, { status: "skipped", lastError: "Reporter emails were turned off." });
  if (!report.notifyReporter) return finish(row, { status: "skipped", lastError: "The reporter turned emails off." });

  const rendered = renderReporterEmail(row.kind, { project, report, settings, stopUrl: stopUrl(row.id) });
  try {
    const { via, id } = await sendAs(project, settings, { to: [row.to], ...rendered, headers: headersFor(row.id), idempotencyKey: `issueit-${row.id}` });
    await finish(row, { status: "sent", via, messageId: id ?? null, sentAt: new Date(), lastError: null });
  } catch (err) {
    const known = err instanceof IntegrationError ? err : null;
    if (!known) console.error("[mail]", row.id, err);
    const message = known?.message ?? "Something went wrong while sending.";
    const retry = (known ? known.retryable : true) && row.attempts < MAX_ATTEMPTS;
    await finish(row, {
      status: retry ? "pending" : "failed",
      lastError: message,
      nextAttemptAt: new Date(Date.now() + RETRIES[Math.min(row.attempts - 1, RETRIES.length - 1)] * 1000),
    });
  }
}

async function finish(row: EmailRow, set: Partial<typeof schema.emails.$inferInsert>) {
  await db
    .update(schema.emails)
    .set({ ...set, lockedUntil: null, updatedAt: new Date() })
    .where(eq(schema.emails.id, row.id));
  await publish({ type: "report.updated", orgId: row.orgId, projectId: row.projectId, reportId: row.reportId }).catch(() => {});
}

/* ------------------------------------------------------------------ worker */

let running = false;
let again = false;
let timer: NodeJS.Timeout | null = null;
let stopped = false;

export function startMailWorker() {
  subscribe((event) => {
    if (event.type === "email.queued") kick();
  });
  kick();
}

export function stopMailWorker() {
  stopped = true;
  if (timer) clearTimeout(timer);
}

function kick() {
  if (stopped) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  void drain()
    .catch((err) => console.error("[mail] drain failed", err))
    .finally(() => {
      running = false;
      if (again) {
        again = false;
        kick();
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(kick, 30_000);
        timer.unref();
      }
    });
}

async function drain() {
  for (;;) {
    const rows = await db.execute<{ id: string }>(sql`
      update emails set status = 'sending', attempts = attempts + 1, locked_until = now() + interval '2 minutes', updated_at = now()
      where id in (
        select id from emails
        where ((status = 'pending' and next_attempt_at <= now()) or (status = 'sending' and locked_until < now())) and attempts < ${MAX_ATTEMPTS}
        order by next_attempt_at
        for update skip locked
        limit 10
      )
      returning id`);
    if (!rows.length) return;
    const claimed = await db.query.emails.findMany({ where: inArray(schema.emails.id, rows.map((r) => r.id)) });
    await Promise.all(claimed.map(send));
  }
}

/** A sample receipt to a member, sent straight away, so the settings can be checked before reporters see them. */
export async function sendTestEmail(project: Project, settings: ProjectEmailSettings, to: string, kind: EmailKind) {
  const sample = { number: 1, title: "The checkout button does nothing", createdAt: new Date(), groupId: null };
  const rendered = renderReporterEmail(kind, { project, report: sample, settings, stopUrl: `${config.appUrl}/projects/${project.id}/settings` });
  return sendAs(project, settings, { to: [to], ...rendered, subject: `[Test] ${rendered.subject}` });
}
