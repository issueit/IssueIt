import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../lib/storage";
import { limitsFor } from "../billing/entitlements";

/**
 * Throwing things away on purpose.
 *
 * Screenshots and captured diagnostics are the heavy, personal part of a bug
 * report: they are what costs money to keep and what nobody wants kept
 * forever. Each plan keeps them for a while and then they go. The report
 * itself — title, page, status — stays unless the organisation has asked for
 * it not to.
 *
 * Deleting the file before the row would leave a broken link, so the row goes
 * first and a file left behind is tidied next time.
 */

const BATCH = 500;

export type RetentionResult = { attachments: number; diagnostics: number; reports: number; bytes: number };

export async function runRetention(): Promise<RetentionResult> {
  const result: RetentionResult = { attachments: 0, diagnostics: 0, reports: 0, bytes: 0 };
  const orgs = await db.query.organisations.findMany();

  for (const org of orgs) {
    const keepDays = limitsFor(org).retentionDays;
    const deleteAfter = org.settings.retentionDays ?? 0;

    if (keepDays > 0) {
      result.bytes += await dropAttachments(sql`org_id = ${org.id} and created_at < now() - make_interval(days => ${keepDays})`, result);
      const stripped = await db.execute<{ id: string }>(sql`
        update reports set diagnostics = '{}'::jsonb
        where org_id = ${org.id} and created_at < now() - make_interval(days => ${keepDays}) and diagnostics <> '{}'::jsonb
        returning id`);
      result.diagnostics += stripped.length;
    }

    // An organisation that asked for reports to go entirely.
    if (deleteAfter > 0) {
      const where = sql`org_id = ${org.id} and report_id in (select id from reports where org_id = ${org.id} and created_at < now() - make_interval(days => ${deleteAfter}))`;
      result.bytes += await dropAttachments(where, result);
      for (;;) {
        const gone = await db.execute<{ id: string }>(sql`
          delete from reports where id in (
            select id from reports where org_id = ${org.id} and created_at < now() - make_interval(days => ${deleteAfter}) limit ${BATCH}
          ) returning id`);
        result.reports += gone.length;
        if (gone.length < BATCH) break;
      }
    }
  }

  // Codes and already-sent email that have no further purpose.
  await db.execute(sql`delete from auth_codes where expires_at < now() - interval '7 days'`);
  await db.execute(sql`delete from device_codes where expires_at < now() - interval '7 days'`);
  await db.execute(sql`delete from notices where status in ('sent', 'skipped') and created_at < now() - interval '30 days'`);
  return result;
}

/** Deletes attachment rows matching a condition, then their files. */
async function dropAttachments(where: ReturnType<typeof sql>, result: RetentionResult): Promise<number> {
  let bytes = 0;
  for (;;) {
    const rows = await db.execute<{ storage_key: string; size_bytes: number }>(sql`
      delete from attachments where id in (select id from attachments where ${where} limit ${BATCH})
      returning storage_key, size_bytes`);
    if (!rows.length) return bytes;
    result.attachments += rows.length;
    bytes += rows.reduce((n, r) => n + Number(r.size_bytes), 0);
    await Promise.all(rows.map((r) => storage.remove(r.storage_key).catch(() => {})));
    if (rows.length < BATCH) return bytes;
  }
}
