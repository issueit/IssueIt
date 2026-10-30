import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sql } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db";
import { subscribe, type AppEvent } from "../lib/events";
import type { AppEnv } from "../http";

export const usageRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const orgId = c.get("orgId");
  const [reports] = await db.execute<{ month: number; last_month: number; total: number }>(sql`
    select
      count(*) filter (where created_at >= date_trunc('month', now()))::int as month,
      count(*) filter (where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now()))::int as last_month,
      count(*)::int as total
    from reports where org_id = ${orgId}`);
  const daily = await db.execute<{ day: string; n: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(count(r.id), 0)::int as n
    from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d(day)
    left join reports r on r.org_id = ${orgId} and date_trunc('day', r.created_at) = d.day
    group by d.day order by d.day`);
  const [storage] = await db.execute<{ bytes: number; files: number; month_files: number }>(sql`
    select coalesce(sum(size_bytes), 0)::bigint as bytes, count(*)::int as files,
      count(*) filter (where created_at >= date_trunc('month', now()))::int as month_files
    from attachments where org_id = ${orgId}`);
  const deliveries = await db.execute<{ status: string; n: number }>(sql`
    select status, count(*)::int as n from deliveries
    where org_id = ${orgId} and not is_test and created_at >= date_trunc('month', now())
    group by status`);
  const byProvider = await db.execute<{ provider: string; n: number }>(sql`
    select d.provider, count(*)::int as n from deliveries x join destinations d on d.id = x.destination_id
    where x.org_id = ${orgId} and not x.is_test and x.status = 'delivered' and x.created_at >= date_trunc('month', now())
    group by d.provider order by n desc`);
  return c.json({
    reports: { month: reports.month, lastMonth: reports.last_month, total: reports.total, daily },
    storage: { bytes: Number(storage.bytes), files: storage.files, monthFiles: storage.month_files },
    deliveries: Object.fromEntries(deliveries.map((d) => [d.status, d.n])),
    deliveriesByProvider: byProvider,
    limits: {
      reportsPerMonth: config.limits.reportsPerMonth || null,
      storageBytes: config.limits.storageBytes || null,
      attachmentBytes: config.limits.attachmentBytes,
      attachmentsPerReport: config.limits.attachmentsPerReport,
    },
  });
});

/** Server-sent events for one organisation. The dashboard invalidates queries on each event. */
export const eventRoutes = new Hono<AppEnv>().get("/", (c) => {
  const orgId = c.get("orgId");
  return streamSSE(c, async (stream) => {
    const queue: AppEvent[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = subscribe((event) => {
      if (event.orgId !== orgId) return;
      queue.push(event);
      wake?.();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });
    await stream.writeSSE({ event: "ready", data: "{}" });
    while (!stream.aborted) {
      if (!queue.length) {
        // A comment every 25 s keeps proxies from closing an idle stream.
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 25_000);
        });
        wake = null;
        if (!queue.length && !stream.aborted) await stream.write(": keep-alive\n\n");
        continue;
      }
      const event = queue.shift()!;
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
    }
    unsubscribe();
  });
});
