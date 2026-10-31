import { config } from "../config";
import { endLapsedTrials, warnAboutTrials } from "../api/billing";
import { runDigests } from "./digest";
import { runRetention } from "./retention";

/**
 * The daily round: retention, digests, trials. One timer, checked every
 * quarter of an hour, which runs the day's work the first time it finds the
 * appointed hour has passed.
 *
 * Deliberately not a cron library. The work is idempotent — retention
 * deletes what is already past its date, digests and warnings are deduped by
 * key — so running twice costs nothing and missing an hour costs a day.
 */

let timer: NodeJS.Timeout | null = null;
/** The last day this ran, as YYYY-MM-DD, so a restart doesn't repeat it. */
let lastRun: string | null = null;

const today = () => new Date().toISOString().slice(0, 10);

export function startJobs() {
  if (timer) return;
  timer = setInterval(() => void tick(), 15 * 60_000);
  timer.unref();
  void tick();
}

export function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  if (new Date().getUTCHours() < config.jobs.hour) return;
  if (lastRun === today()) return;
  lastRun = today();
  await runDaily();
}

/** Exported so an operator can run the round by hand. */
export async function runDaily() {
  const started = Date.now();
  try {
    if (config.jobs.retention) {
      const r = await runRetention();
      if (r.attachments || r.reports || r.diagnostics) {
        console.log(`[jobs] retention: ${r.attachments} attachments (${Math.round(r.bytes / 1024 / 1024)} MB), ${r.diagnostics} diagnostics, ${r.reports} reports`);
      }
    }
  } catch (err) {
    console.error("[jobs] retention failed", err);
  }

  try {
    const daily = await runDigests("daily");
    // Monday is the week in review.
    const weekly = new Date().getUTCDay() === 1 ? await runDigests("weekly") : 0;
    if (daily || weekly) console.log(`[jobs] digests: ${daily} daily, ${weekly} weekly`);
  } catch (err) {
    console.error("[jobs] digests failed", err);
  }

  try {
    const warned = await warnAboutTrials();
    const ended = await endLapsedTrials();
    if (warned || ended) console.log(`[jobs] trials: ${warned} ending soon, ${ended} ended`);
  } catch (err) {
    console.error("[jobs] trials failed", err);
  }
  console.log(`[jobs] daily round done in ${Date.now() - started}ms`);
}
