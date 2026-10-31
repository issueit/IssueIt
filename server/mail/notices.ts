import { eq, inArray, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import type { NoticeKind } from "../db/schema";
import { newId } from "../lib/ids";
import { IntegrationError } from "../integrations/http";
import { personalAddress, renderNotice } from "./copy";
import { sendSystemMail, systemMailAvailable } from "./system";

/**
 * The outbox for Issueit's own email. Rows in Postgres, claimed with SKIP
 * LOCKED and retried with backoff, like deliveries and reporter emails, so a
 * mail server having a bad minute doesn't swallow a password reset.
 *
 * Rows hold the context, not the rendered message: fixing a template reaches
 * everything still queued.
 */

type NoticeRow = typeof schema.notices.$inferSelect;

const RETRIES = [30, 120, 600, 3600];
const MAX_ATTEMPTS = RETRIES.length + 1;

export type NoticeInput = {
  to: string;
  kind: NoticeKind;
  context: Record<string, unknown>;
  orgId?: string | null;
  userId?: string | null;
  /** Stops a second copy of the same digest or warning being queued. */
  dedupeKey?: string;
  /** Holds the email back, for the ones that shouldn't land the same minute as everything else. */
  delaySeconds?: number;
};

async function insertNotice(input: NoticeInput): Promise<NoticeRow | null> {
  const [row] = await db
    .insert(schema.notices)
    .values({
      id: newId("ntc"),
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      to: input.to,
      kind: input.kind,
      context: input.context,
      dedupeKey: input.dedupeKey ?? null,
      ...(input.delaySeconds ? { nextAttemptAt: new Date(Date.now() + input.delaySeconds * 1000) } : {}),
    })
    .onConflictDoNothing({ target: schema.notices.dedupeKey })
    .returning();
  return row ?? null;
}

/** Queues one. Returns false when the install can't send email at all. */
export async function queueNotice(input: NoticeInput): Promise<boolean> {
  if (!systemMailAvailable()) {
    console.warn(`[notices] no SMTP_URL, so the "${input.kind}" email to ${input.to} wasn't sent`);
    return false;
  }
  await insertNotice(input);
  kick();
  return true;
}

/**
 * Queues one and waits for the attempt, for the emails somebody is sitting
 * in front of: a reset link is no use arriving a minute late. Queued first
 * all the same, so a failure is retried rather than lost.
 */
export async function sendNoticeNow(input: NoticeInput): Promise<boolean> {
  if (!systemMailAvailable()) {
    console.warn(`[notices] no SMTP_URL, so the "${input.kind}" email to ${input.to} wasn't sent`);
    return false;
  }
  const row = await insertNotice(input);
  // A duplicate of something already queued; the worker has it.
  if (!row) return true;
  await db.update(schema.notices).set({ status: "sending", attempts: 1, lockedUntil: new Date(Date.now() + 120_000) }).where(eq(schema.notices.id, row.id));
  await send({ ...row, attempts: 1 });
  const [after] = await db.select({ status: schema.notices.status }).from(schema.notices).where(eq(schema.notices.id, row.id));
  return after?.status !== "failed";
}

/* ------------------------------------------------------------------ sending */

/**
 * The note from a person comes from that person's address, with replies
 * going back to them. Everything else comes from the product.
 */
function senderFor(kind: NoticeRow["kind"]) {
  if (kind !== "personal" || !config.smtp.personalFrom) return {};
  return { from: config.smtp.personalFrom, replyTo: personalAddress() };
}

async function send(row: NoticeRow) {
  try {
    const rendered = renderNotice(row.kind, row.context);
    const { id } = await sendSystemMail({ to: row.to, ...rendered, ...senderFor(row.kind) });
    await finish(row, { status: "sent", messageId: id ?? null, sentAt: new Date(), lastError: null });
  } catch (err) {
    const known = err instanceof IntegrationError ? err : null;
    if (!known) console.error("[notices]", row.id, err);
    const retry = (known ? known.retryable : true) && row.attempts < MAX_ATTEMPTS;
    await finish(row, {
      status: retry ? "pending" : "failed",
      lastError: known?.message ?? "Something went wrong while sending.",
      nextAttemptAt: new Date(Date.now() + RETRIES[Math.min(row.attempts - 1, RETRIES.length - 1)] * 1000),
    }).catch(() => {});
  }
}

async function finish(row: NoticeRow, set: Partial<typeof schema.notices.$inferInsert>) {
  await db.update(schema.notices).set({ ...set, lockedUntil: null }).where(eq(schema.notices.id, row.id));
}

/* ------------------------------------------------------------------- worker */

let running = false;
let again = false;
let timer: NodeJS.Timeout | null = null;
let stopped = false;

export function startNoticeWorker() {
  stopped = false;
  kick();
}

export function stopNoticeWorker() {
  stopped = true;
  if (timer) clearTimeout(timer);
}

function kick() {
  if (stopped || !systemMailAvailable()) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  void drain()
    .catch((err) => console.error("[notices] drain failed", err))
    .finally(() => {
      running = false;
      if (again) {
        again = false;
        kick();
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(kick, 60_000);
        timer.unref();
      }
    });
}

async function drain() {
  for (;;) {
    const rows = await db.execute<{ id: string }>(sql`
      update notices set status = 'sending', attempts = attempts + 1, locked_until = now() + interval '2 minutes'
      where id in (
        select id from notices
        where ((status = 'pending' and next_attempt_at <= now()) or (status = 'sending' and locked_until < now())) and attempts < ${MAX_ATTEMPTS}
        order by next_attempt_at
        for update skip locked
        limit 20
      )
      returning id`);
    if (!rows.length) return;
    const claimed = await db.query.notices.findMany({ where: inArray(schema.notices.id, rows.map((r) => r.id)) });
    await Promise.all(claimed.map(send));
  }
}
