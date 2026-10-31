import { eq, inArray, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import type { NoticeKind } from "../db/schema";
import { newId } from "../lib/ids";
import { IntegrationError } from "../integrations/http";
import { layout, sendSystemMail, systemMailAvailable, type Rendered } from "./system";

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

/* ---------------------------------------------------------------- rendering */

const dash = (path = "") => `${config.appUrl}${path}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything a notice can say. Context is whatever the queueing side put in. */
export function renderNotice(kind: NoticeKind, ctx: Record<string, any>): Rendered {
  switch (kind) {
    case "password-reset":
      return layout({
        subject: "Reset your Issueit password",
        heading: "Reset your password",
        blocks: [
          { p: `Someone asked to reset the password for ${ctx.email}. If that was you, choose a new one.` },
          { button: { label: "Choose a new password", url: ctx.url } },
          { note: `The link works once and expires in ${ctx.minutes ?? 60} minutes. If it wasn't you, nothing has changed and you can ignore this.` },
        ],
      });

    case "verify-email":
      return layout({
        subject: "Confirm your email address",
        heading: "Confirm your email address",
        blocks: [
          { p: `Confirming ${ctx.email} lets Issueit send you password resets and the alerts you ask for.` },
          { button: { label: "Confirm this address", url: ctx.url } },
          { note: "The link works once and expires in 24 hours." },
        ],
      });

    case "invitation":
      return layout({
        subject: `${ctx.invitedBy} invited you to ${ctx.orgName} on Issueit`,
        heading: `You've been invited to ${ctx.orgName}`,
        blocks: [
          { p: `${ctx.invitedBy} has invited you to join ${ctx.orgName} on Issueit as ${ctx.role === "owner" ? "an owner" : "a member"}. Issueit collects bug reports from their product and delivers them to the tools the team already uses.` },
          { button: { label: "Accept the invitation", url: ctx.url } },
          { note: "The invitation expires in seven days. If you weren't expecting it, you can ignore it." },
        ],
      });

    case "report":
      return layout({
        subject: `[${ctx.projectName}] ${String(ctx.title).slice(0, 90)}`,
        heading: ctx.title,
        blocks: [
          { p: `A ${ctx.priority} report arrived in ${ctx.projectName}.` },
          {
            facts: [
              ["Report", `#${ctx.number}`],
              ["Priority", String(ctx.priority)],
              ...(ctx.page ? ([["Page", String(ctx.page)]] as Array<[string, string]>) : []),
              ...(ctx.reporter ? ([["Reported by", String(ctx.reporter)]] as Array<[string, string]>) : []),
            ],
          },
          { button: { label: "Open the report", url: ctx.url } },
          { note: "You're getting this because of your notification settings for this organisation." },
        ],
        footer: `Change what you're told about at ${dash("/settings/notifications")}`,
      });

    case "pipeline":
      return layout({
        subject: `Issueit paused ${ctx.destinationName}`,
        heading: `${ctx.destinationName} has been paused`,
        blocks: [
          { p: `Issueit stopped sending to ${ctx.destinationName} in ${ctx.projectName} because deliveries kept failing. Reports are still being collected and will be delivered once it's working again.` },
          { facts: [["Reason", String(ctx.reason ?? "Repeated failures")]] },
          { button: { label: "Look at the destination", url: ctx.url } },
        ],
        footer: `Change what you're told about at ${dash("/settings/notifications")}`,
      });

    case "digest": {
      const period = ctx.period === "week" ? "week" : "day";
      const counts = ctx.counts ?? {};
      return layout({
        subject: `${ctx.orgName}: ${plural(counts.created ?? 0, "new report")} ${period === "week" ? "this week" : "yesterday"}`,
        heading: period === "week" ? "Your week on Issueit" : "Yesterday on Issueit",
        blocks: [
          { p: `${plural(counts.created ?? 0, "new report")} arrived, ${plural(counts.resolved ?? 0, "report")} ${(counts.resolved ?? 0) === 1 ? "was" : "were"} resolved${counts.failed ? `, and ${plural(counts.failed, "delivery")} failed` : ""}.` },
          ...(ctx.items?.length ? [{ list: ctx.items } as const] : [{ p: "Nothing needs you right now." } as const]),
          ...(counts.refused ? [{ note: `${plural(counts.refused, "report")} ${counts.refused === 1 ? "was" : "were"} turned away because the plan's monthly allowance is used up.` } as const] : []),
          { button: { label: "Open Issueit", url: ctx.url } },
        ],
        footer: `Change or stop the digest at ${dash("/settings/notifications")}`,
      });
    }

    case "limit-warning":
      return layout({
        subject: `You've used ${ctx.percent}% of this month's reports`,
        heading: `${ctx.orgName} has used ${ctx.percent}% of this month's reports`,
        blocks: [
          { p: `${ctx.used} of ${ctx.limit} reports this month. Issueit keeps accepting a little past the allowance, but after that new reports are turned away.` },
          { button: { label: "Look at the plans", url: ctx.url } },
        ],
      });

    case "limit-reached":
      return layout({
        subject: "Issueit has started turning reports away",
        heading: `${ctx.orgName} has used up this month's reports`,
        blocks: [
          { p: `${ctx.used} of ${ctx.limit} reports have been used, and ${ctx.refused ? plural(ctx.refused, "report") : "new reports"} ${ctx.refused === 1 ? "has" : "have"} been turned away. Your users are reporting bugs you aren't seeing.` },
          { button: { label: "Change plan", url: ctx.url } },
          { note: "The allowance resets at the start of next month." },
        ],
      });

    case "trial-ending":
      return layout({
        subject: ctx.days > 0 ? `Your Issueit trial ends in ${plural(ctx.days, "day")}` : "Your Issueit trial has ended",
        heading: ctx.days > 0 ? `Your trial ends in ${plural(ctx.days, "day")}` : "Your trial has ended",
        blocks: [
          {
            p:
              ctx.days > 0
                ? `${ctx.orgName} is on the ${ctx.plan} plan until then. Choosing a plan now keeps everything as it is; doing nothing moves you to Free, which keeps collecting reports with a smaller allowance.`
                : `${ctx.orgName} has moved to the Free plan. Your projects, destinations and reports are all still here, with a smaller monthly allowance.`,
          },
          { button: { label: "Look at the plans", url: ctx.url } },
        ],
      });

    case "payment-problem":
      return layout({
        subject: "Issueit couldn't take your payment",
        heading: "Your last payment didn't go through",
        blocks: [
          { p: `${ctx.orgName}'s subscription couldn't be charged. Nothing has changed yet, and Issueit is still collecting your reports. Updating the card settles it.` },
          ...(ctx.problem ? [{ facts: [["What Stripe said", String(ctx.problem)]] } as const] : []),
          { button: { label: "Update payment details", url: ctx.url } },
        ],
      });
  }
}

/* ------------------------------------------------------------------ sending */

async function send(row: NoticeRow) {
  try {
    const rendered = renderNotice(row.kind, row.context);
    const { id } = await sendSystemMail({ to: row.to, ...rendered });
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
