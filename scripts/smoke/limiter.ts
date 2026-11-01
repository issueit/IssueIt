/** Exercises the real limiter against a real database. See scripts/smoke/run.sh. */
import { hit, hitAll, pruneRateLimits } from "../../server/lib/ratelimit";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";

const fail = (what: string): never => {
  throw new Error(`FAILED: ${what}`);
};

await db.execute(sql`create table if not exists rate_limits ("key" text primary key, count integer default 0 not null, reset_at timestamptz not null)`);
await db.execute(sql`delete from rate_limits where key like 'probe:%'`);

// One limit, three hits, max 2: the third must be refused.
const one = { key: "probe:single", max: 2, windowMs: 60_000 };
const a = await hit(one);
const b = await hit(one);
const c = await hit(one);
if (!a.ok || !b.ok) fail("the first two hits should have fitted");
if (c.ok) fail("the third hit should have been refused");
if (c.retryAfter < 1 || c.retryAfter > 60) fail(`retryAfter out of range: ${c.retryAfter}`);

// It must have counted in the database, not in memory.
const [row] = await db.execute<{ count: number }>(sql`select count from rate_limits where key = 'probe:single'`);
if (!row) fail("nothing was written to rate_limits — the in-memory fallback ran");
if (Number(row.count) !== 2) fail(`expected the refused hit to be given back, leaving 2, got ${row.count}`);

// Several limits at once, the narrow one refusing: nothing may be consumed.
const wide = { key: "probe:wide", max: 100, windowMs: 3600_000 };
const narrow = { key: "probe:narrow", max: 1, windowMs: 60_000 };
await hitAll([wide, narrow]);
const refused = await hitAll([wide, narrow]);
if (refused.ok) fail("the narrow limit should have refused the second call");
const [wideRow] = await db.execute<{ count: number }>(sql`select count from rate_limits where key = 'probe:wide'`);
if (Number(wideRow.count) !== 1) fail(`a refused request must not spend the wide limit; count is ${wideRow.count}`);

// Separate windows, kept apart.
const [windows] = await db.execute<{ n: number }>(sql`
  select count(distinct date_trunc('second', reset_at))::int as n from rate_limits where key in ('probe:wide','probe:narrow')`);
if (Number(windows.n) !== 2) fail("the two limits should hold different windows");

// A window that has passed starts again rather than staying refused.
await db.execute(sql`update rate_limits set reset_at = now() - interval '1 second' where key = 'probe:single'`);
const after = await hit(one);
if (!after.ok) fail("a passed window should have started again");

// The same key twice in one call must not make Postgres refuse the statement.
const twice = await hitAll([{ key: "probe:dupe", max: 5, windowMs: 60_000 }, { key: "probe:dupe", max: 5, windowMs: 60_000 }]);
if (!twice.ok) fail("a duplicated key should still count");

await db.execute(sql`update rate_limits set reset_at = now() - interval '2 hours' where key like 'probe:%'`);
if ((await pruneRateLimits()) < 1) fail("pruning should have deleted the passed windows");

await db.execute(sql`delete from rate_limits where key like 'probe:%'`);
console.log("limiter: every check passed against a real database");
process.exit(0);
