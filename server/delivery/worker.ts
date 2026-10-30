import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptJson } from "../lib/crypto";
import { publish, subscribe } from "../lib/events";
import { getProvider } from "../integrations";
import { handleFor, markConnection } from "../integrations/connections";
import { duplicateComment } from "../integrations/format";
import { IntegrationError, withTimeout } from "../integrations/http";
import type { ConnectionHandle, DeliveryResult, Provider, ReportPayload } from "../integrations/types";
import type { AttemptLogEntry, WebhookEvent } from "../db/schema";
import { backoffSeconds, effectivePolicy, shapeReport, shouldRetry, takeSlot, type EffectivePolicy } from "./policy";
import { dashboardReportUrl, loadReportPayload } from "./payload";

type Delivery = typeof schema.deliveries.$inferSelect;

/**
 * The delivery worker. Deliveries are rows in Postgres; this claims due rows
 * with SKIP LOCKED, so several processes can run it safely. It wakes when a
 * delivery is queued (LISTEN/NOTIFY) and when the next retry falls due.
 */

const BATCH = 10;
const LOCK_SECONDS = 120;

let running = false;
let again = false;
let timer: NodeJS.Timeout | null = null;
let stopped = false;

export function startWorker() {
  subscribe((event) => {
    if (event.type === "delivery.queued") kick();
  });
  kick();
  console.log("[worker] delivery worker started");
}

export function stopWorker() {
  stopped = true;
  if (timer) clearTimeout(timer);
}

export function kick() {
  if (stopped) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  void drain()
    .catch((err) => console.error("[worker] drain failed", err))
    .finally(async () => {
      running = false;
      if (again) {
        again = false;
        kick();
      } else {
        await scheduleNext().catch((err) => console.error("[worker] schedule failed", err));
      }
    });
}

async function drain() {
  for (;;) {
    const batch = await claim();
    if (!batch.length) return;
    await Promise.all(batch.map((d) => attempt(d)));
  }
}

async function claim(): Promise<Delivery[]> {
  const rows = await db.execute<{ id: string }>(sql`
    update deliveries set status = 'delivering', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${LOCK_SECONDS}), updated_at = now()
    where id in (
      select id from deliveries
      where (status in ('pending', 'retrying') and next_attempt_at <= now())
         or (status = 'delivering' and locked_until < now())
      order by next_attempt_at
      for update skip locked
      limit ${BATCH}
    )
    returning id`);
  if (!rows.length) return [];
  return db.query.deliveries.findMany({ where: inArray(schema.deliveries.id, rows.map((r) => r.id)) });
}

/** Sleeps until the next retry is due, at most a minute so stale locks get reclaimed. */
async function scheduleNext() {
  if (timer) clearTimeout(timer);
  const [row] = await db.execute<{ next: Date | null }>(sql`
    select min(case when status = 'delivering' then locked_until else next_attempt_at end) as next
    from deliveries where status in ('pending', 'retrying', 'delivering')`);
  const next = row?.next ? new Date(row.next).getTime() : null;
  const delay = next === null ? 60_000 : Math.min(Math.max(next - Date.now(), 250), 60_000);
  timer = setTimeout(kick, delay);
  timer.unref();
}

type Destination = typeof schema.destinations.$inferSelect;

/** Keeps the last few attempts on the row, so the log can show what happened each time. */
const MAX_LOG = 20;
const logged = (d: Delivery, entry: AttemptLogEntry) => [...(d.attemptLog ?? []), entry].slice(-MAX_LOG);

/** Runs one delivery. Also used directly for "Send test". */
export async function attempt(delivery: Delivery, testReport?: ReportPayload): Promise<{ ok: true; result: DeliveryResult } | { ok: false; error: string }> {
  const destination = (await db.query.destinations.findFirst({ where: eq(schema.destinations.id, delivery.destinationId) })) ?? null;
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, delivery.orgId), columns: { settings: true } });
  const policy = effectivePolicy(org?.settings.delivery, destination?.policy);

  // Pacing: hand the slot back and come back when the window has room.
  if (destination && !delivery.isTest) {
    const wait = takeSlot(destination.id, policy.rateLimitPerMinute);
    if (wait) {
      await db
        .update(schema.deliveries)
        .set({ status: "pending", attempts: sql`greatest(${schema.deliveries.attempts} - 1, 0)`, nextAttemptAt: new Date(Date.now() + wait * 1000), lockedUntil: null, updatedAt: new Date() })
        .where(eq(schema.deliveries.id, delivery.id));
      return { ok: false, error: "Waiting for the destination's rate limit." };
    }
  }

  const started = Date.now();
  try {
    const result = await withTimeout(policy.timeoutSeconds * 1000, () => perform(delivery, destination, policy, testReport));
    const ms = Date.now() - started;
    await db
      .update(schema.deliveries)
      .set({
        status: "delivered",
        externalId: result.externalId ?? null,
        externalUrl: result.externalUrl ?? null,
        responseStatus: result.responseStatus ?? null,
        lastError: null,
        durationMs: ms,
        maxAttempts: delivery.isTest ? 1 : policy.maxAttempts,
        attemptLog: logged(delivery, { at: new Date().toISOString(), ok: true, ms, status: result.responseStatus ?? null }),
        deliveredAt: new Date(),
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.deliveries.id, delivery.id));
    await notify(delivery);
    return { ok: true, result };
  } catch (err) {
    const ms = Date.now() - started;
    const known = err instanceof IntegrationError ? err : null;
    if (!known) console.error("[worker] delivery", delivery.id, err);
    const message = known ? known.message : "Something went wrong while delivering. Issueit will try again.";
    const attempts = delivery.attempts;
    const retry = !delivery.isTest && attempts < policy.maxAttempts && shouldRetry(policy, known);
    const hinted = policy.respectRetryAfter && known?.retryAfter ? known.retryAfter : 0;
    const wait = Math.max(hinted, backoffSeconds(policy, attempts));
    const exhausted = !retry && !delivery.isTest && attempts >= policy.maxAttempts && shouldRetry(policy, known);
    await db
      .update(schema.deliveries)
      .set({
        status: retry ? "retrying" : "failed",
        lastError: retry ? withRetryNote(message) : finalError(message, exhausted ? attempts : 0),
        responseStatus: known?.status ?? null,
        maxAttempts: delivery.isTest ? 1 : policy.maxAttempts,
        attemptLog: logged(delivery, { at: new Date().toISOString(), ok: false, ms, status: known?.status ?? null, error: message }),
        nextAttemptAt: new Date(Date.now() + wait * 1000),
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.deliveries.id, delivery.id));
    if (known?.reconnect && destination?.connectionId) await markConnection(destination.connectionId, "error", message);
    if (!retry && !delivery.isTest && destination && policy.autoPauseAfter) await maybePause(destination, policy.autoPauseAfter, message);
    await notify(delivery);
    return { ok: false, error: message };
  }
}

/** Retries are announced in the message, whatever the provider's own wording. */
function withRetryNote(message: string) {
  return /will try again\.$/.test(message) ? message : `${message.replace(/\.?$/, ".")} Issueit will try again.`;
}

/** The last word on a delivery that won't be retried. */
function finalError(message: string, attempts: number) {
  const base = message.replace(/ Issueit will try again\.$/, "");
  return attempts ? `${base} Gave up after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}.` : base;
}

/** Pauses a destination whose last `limit` finished deliveries all failed, so a broken target stops piling up failures. */
async function maybePause(destination: Destination, limit: number, lastError: string) {
  const recent = await db.execute<{ status: string }>(sql`
    select status from deliveries
    where destination_id = ${destination.id} and not is_test and status in ('delivered', 'failed')
    order by updated_at desc limit ${limit}`);
  if (recent.length < limit || recent.some((r) => r.status !== "failed")) return;
  await db
    .update(schema.destinations)
    .set({ enabled: false, pausedReason: `Paused automatically after ${limit} failed ${limit === 1 ? "delivery" : "deliveries"} in a row. Last error: ${lastError}`, updatedAt: new Date() })
    .where(eq(schema.destinations.id, destination.id));
}

async function perform(delivery: Delivery, destination: Destination | null, policy: EffectivePolicy, testReport?: ReportPayload): Promise<DeliveryResult> {
  if (!destination) throw new IntegrationError("This destination was removed.", { retryable: false });
  const provider = getProvider(destination.provider);
  if (!provider) throw new IntegrationError("This destination's service is no longer supported.", { retryable: false });

  if (delivery.event === "report.duplicate" && provider.kind !== "webhook") return addToIssue(delivery, destination, provider, policy);

  const loaded = testReport ?? (delivery.reportId ? await loadReportPayload(delivery.reportId) : null);
  if (!loaded) throw new IntegrationError("The report was deleted before it could be delivered.", { retryable: false });
  const report = shapeReport(loaded, policy);

  // A tracker issue is created once per report, even if the event is queued again.
  if (provider.kind === "tracker" && delivery.event === "report.created" && delivery.reportId && !delivery.isTest) {
    const earlier = await db.query.deliveries.findFirst({
      where: sql`${schema.deliveries.destinationId} = ${destination.id} and ${schema.deliveries.reportId} = ${delivery.reportId}
        and ${schema.deliveries.status} = 'delivered' and ${schema.deliveries.id} <> ${delivery.id} and ${schema.deliveries.event} = 'report.created'`,
    });
    if (earlier) return { externalId: earlier.externalId ?? undefined, externalUrl: earlier.externalUrl ?? undefined };
  }

  const connection = provider.kind !== "webhook" ? await connectionFor(destination) : null;

  const result = await provider.deliver({
    deliveryId: delivery.id,
    event: delivery.event as WebhookEvent,
    report,
    target: destination.target,
    connection,
    secrets: destination.secrets ? decryptJson<Record<string, string>>(destination.secrets) : null,
    payload: delivery.payload ?? null,
    isTest: delivery.isTest,
  });
  if (connection && destination.connectionId) {
    const row = await db.query.connections.findFirst({ where: eq(schema.connections.id, destination.connectionId), columns: { status: true } });
    if (row?.status === "error") await markConnection(destination.connectionId, "active");
  }
  return result;
}

async function connectionFor(destination: Destination): Promise<ConnectionHandle> {
  if (!destination.connectionId) throw new IntegrationError("This destination has no connected account.", { retryable: false });
  const row = await db.query.connections.findFirst({ where: eq(schema.connections.id, destination.connectionId) });
  if (!row) throw new IntegrationError("The connected account was removed. Connect it again.", { retryable: false });
  return handleFor(row);
}

/** The issue a destination created for a report, once that delivery has gone through. */
export async function issueFor(destinationId: string, reportId: string) {
  return db.query.deliveries.findFirst({
    where: sql`${schema.deliveries.destinationId} = ${destinationId} and ${schema.deliveries.reportId} = ${reportId}
      and ${schema.deliveries.event} = 'report.created' and not ${schema.deliveries.isTest}`,
    orderBy: sql`${schema.deliveries.createdAt} desc`,
  });
}

/** Comments on the first report's issue that the bug was reported again. */
async function addToIssue(delivery: Delivery, destination: Destination, provider: Provider, policy: EffectivePolicy): Promise<DeliveryResult> {
  if (!provider.comment || !delivery.reportId) throw new IntegrationError(`${provider.name} can't take comments from Issueit.`, { retryable: false });
  const original = await issueFor(destination.id, delivery.reportId);
  if (!original) throw new IntegrationError("The first report was never sent here, so there's no issue to add to.", { retryable: false });
  if (original.status === "failed") throw new IntegrationError("The first report didn't reach this destination, so there's no issue to add to.", { retryable: false });
  if (original.status !== "delivered") throw new IntegrationError("Waiting for the first report's issue to be created. Issueit will try again.", { retryable: true });
  if (!original.externalId) throw new IntegrationError(`${provider.name} didn't say which issue it created, so Issueit can't add to it.`, { retryable: false });
  const info = (delivery.payload ?? {}) as { duplicateId?: string; count?: number };
  const latest = (info.duplicateId && (await loadReportPayload(info.duplicateId))) || (await loadReportPayload(delivery.reportId));
  if (!latest) throw new IntegrationError("The report was deleted before it could be delivered.", { retryable: false });
  const body = duplicateComment(shapeReport(latest, policy), info.count ?? 2, dashboardReportUrl(delivery.reportId));
  return provider.comment({ connection: await connectionFor(destination), target: destination.target, externalId: original.externalId, externalUrl: original.externalUrl }, body);
}

async function notify(d: Delivery) {
  await publish({ type: "delivery.updated", orgId: d.orgId, projectId: d.projectId, reportId: d.reportId, deliveryId: d.id }).catch(() => {});
}
