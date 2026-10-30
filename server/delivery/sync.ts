import { eq, inArray, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { getProvider } from "../integrations";
import { handleFor } from "../integrations/connections";
import { IntegrationError } from "../integrations/http";
import { setReportStatus } from "../reports/status";

/**
 * Closing the loop. Every few minutes Issueit asks trackers about the issues
 * it opened for reports that are still open. When an issue has been closed
 * there, the report is resolved here, which in turn emails the people who
 * reported it. Polling works behind NAT and on a LAN, where a tracker's
 * webhooks couldn't reach Issueit.
 */

const BATCH = 25;
/** Reports older than this are left alone. */
const MAX_AGE_DAYS = 180;

let timer: NodeJS.Timeout | null = null;
let stopped = false;

export function startSync() {
  const every = config.syncMinutes * 60_000;
  if (!every) return;
  const loop = () => {
    if (stopped) return;
    void runSync()
      .catch((err) => console.error("[sync] failed", err))
      .finally(() => {
        if (stopped) return;
        timer = setTimeout(loop, every);
        timer.unref();
      });
  };
  timer = setTimeout(loop, 20_000);
  timer.unref();
}

export function stopSync() {
  stopped = true;
  if (timer) clearTimeout(timer);
}

/** Claims due issues by stamping them first, so two workers never ask about the same one. Returns how many it checked. */
export async function runSync(): Promise<number> {
  const interval = `${Math.max(1, config.syncMinutes)} minutes`;
  const due = await db.execute<{ id: string }>(sql`
    update deliveries set state_checked_at = now()
    where id in (
      select d.id from deliveries d
      join destinations dest on dest.id = d.destination_id
      join reports r on r.id = d.report_id
      where d.event = 'report.created' and d.status = 'delivered' and not d.is_test and d.external_id is not null
        and dest.enabled and dest.sync_state
        and r.status in ('new', 'investigating') and r.group_id is null
        and r.created_at > now() - make_interval(days => ${MAX_AGE_DAYS})
        and (d.state_checked_at is null or d.state_checked_at < now() - ${interval}::interval)
      order by d.state_checked_at nulls first
      for update of d skip locked
      limit ${BATCH}
    )
    returning id`);
  if (!due.length) return 0;
  const rows = await db.query.deliveries.findMany({ where: inArray(schema.deliveries.id, due.map((d) => d.id)) });
  for (const delivery of rows) await check(delivery).catch((err) => console.error("[sync]", delivery.id, err));
  return rows.length;
}

async function check(delivery: typeof schema.deliveries.$inferSelect) {
  const destination = await db.query.destinations.findFirst({ where: eq(schema.destinations.id, delivery.destinationId) });
  const provider = destination && getProvider(destination.provider);
  if (!destination?.connectionId || !provider?.issueState || !delivery.reportId || !delivery.externalId) return;
  const row = await db.query.connections.findFirst({ where: eq(schema.connections.id, destination.connectionId) });
  if (!row || row.status === "error") return;

  let state;
  try {
    state = await provider.issueState({ connection: handleFor(row), target: destination.target, externalId: delivery.externalId, externalUrl: delivery.externalUrl });
  } catch (err) {
    // A missing or unreadable issue isn't worth an alarm; try again next round.
    if (!(err instanceof IntegrationError)) throw err;
    return;
  }
  if (state === delivery.externalState) return;
  await db.update(schema.deliveries).set({ externalState: state }).where(eq(schema.deliveries.id, delivery.id));
  if (state === "open") return;

  const report = await db.query.reports.findFirst({ where: eq(schema.reports.id, delivery.reportId) });
  if (!report || (report.status !== "new" && report.status !== "investigating")) return;
  await setReportStatus(report, state);
}
