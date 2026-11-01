import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";

/**
 * Fixed-window counters, shared by every instance through one table.
 *
 * Each key is a row with a count and the moment its window ends. The upsert
 * below does the whole thing in one statement: start a new window if the old
 * one has passed, otherwise add one to the count, and say what the count now
 * is. No read-then-write, so two requests arriving together can't both see
 * room for themselves.
 *
 * If the database can't be reached the counters fall back to this process's
 * memory. Refusing every request because the limiter is unwell would turn a
 * database blip into an outage, and letting everything through would leave
 * the door open; counting locally is wrong only by however many instances
 * are running, which is the behaviour this module used to have all the time.
 */
export type Limit = { key: string; max: number; windowMs: number };

export type Verdict = { ok: boolean; retryAfter: number };

/** Counts one against a limit and says whether it fitted. */
export async function hit(limit: Limit): Promise<Verdict> {
  return hitAll([limit]);
}

/**
 * Checks every limit and only counts against them if all pass. A request
 * that was refused shouldn't also use up the budget of the limits it did
 * fit inside, so the counts that were added are taken back off.
 */
export async function hitAll(limits: Limit[]): Promise<Verdict> {
  if (!limits.length) return { ok: true, retryAfter: 0 };
  let counted: Array<{ key: string; count: number; resetAt: Date }>;
  try {
    counted = await bump(limits);
  } catch (err) {
    console.error("[ratelimit] couldn't reach the counters; counting in memory instead", err);
    return local(limits);
  }

  const over = counted.filter((row) => {
    const limit = limits.find((l) => l.key === row.key);
    return limit && row.count > limit.max;
  });
  if (!over.length) return { ok: true, retryAfter: 0 };

  await unbump(counted.map((row) => row.key)).catch((err) => console.error("[ratelimit] couldn't give back a refused request's count", err));
  const until = Math.max(...over.map((row) => row.resetAt.getTime()));
  return { ok: false, retryAfter: Math.max(1, Math.ceil((until - Date.now()) / 1000)) };
}

const commas = (parts: SQL[]) => sql.join(parts, sql.raw(", "));

/**
 * One statement, every key: open a fresh window or add to the open one.
 *
 * The rows are written out as a values list of scalar parameters rather than
 * passed as two arrays. The driver doesn't bind a JavaScript array to an
 * array parameter here — it unwraps a single-element one and then refuses the
 * number inside it — and a limiter that throws is a limiter that isn't
 * counting.
 */
async function bump(limits: Limit[]) {
  // The same key twice in one insert makes Postgres refuse the whole
  // statement, so a caller passing one limit twice gets it counted once.
  const unique = [...new Map(limits.map((l) => [l.key, l])).values()];
  const values = unique.map((l) => sql`(${l.key}, 1, now() + make_interval(secs => ${l.windowMs / 1000}))`);
  const rows = await db.execute<{ key: string; count: number; reset_at: string | Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values ${commas(values)}
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning key, count, reset_at`);
  return rows.map((row) => ({ key: row.key, count: Number(row.count), resetAt: new Date(row.reset_at) }));
}

function unbump(keys: string[]) {
  return db.execute(sql`update rate_limits set count = greatest(count - 1, 0) where key in (${commas(keys.map((k) => sql`${k}`))})`);
}

/** Deletes windows that have passed. Run from the nightly job. */
export async function pruneRateLimits(): Promise<number> {
  const gone = await db.execute<{ key: string }>(sql`delete from rate_limits where reset_at < now() - interval '1 hour' returning key`);
  return gone.length;
}

/* ------------------------------------------------- the fallback in memory */

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

function local(limits: Limit[]): Verdict {
  const now = Date.now();
  for (const l of limits) {
    const w = windows.get(l.key);
    if (w && w.resetAt > now && w.count >= l.max) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  for (const l of limits) {
    let w = windows.get(l.key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + l.windowMs };
      windows.set(l.key, w);
    }
    w.count += 1;
  }
  return { ok: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}, 60_000).unref();
