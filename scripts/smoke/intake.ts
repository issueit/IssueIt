/** Exercises the new report columns and the retention sweep. See scripts/smoke/run.sh. */
import { sql } from "drizzle-orm";
import { db, runMigrations, schema } from "../../server/db";
import { velocityFor, contentHashOf } from "../../server/ingest/protection";
import { runRetention } from "../../server/jobs/retention";

const fail = (what: string): never => {
  throw new Error(`FAILED: ${what}`);
};

await runMigrations();

await db.insert(schema.organisations).values({ id: "org_probe", name: "Probe" });
await db.insert(schema.projects).values({ id: "prj_probe", orgId: "org_probe", name: "Probe" });

const hash = contentHashOf("Buy   NOW", "cheap\nstuff");

// A held-back report, written the way intake writes one: a text[] of reasons
// through the query builder, which is the part a driver can get wrong.
await db.insert(schema.reports).values({
  id: "rep_held",
  orgId: "org_probe",
  projectId: "prj_probe",
  number: 1,
  title: "Buy NOW",
  description: "cheap stuff",
  ipHash: "hash_spam",
  contentHash: hash,
  quarantinedAt: new Date(Date.now() - 9 * 86_400_000),
  spamScore: 9,
  spamReasons: ["3 links", "advertising language (casino, backlink)"],
  createdAt: new Date(Date.now() - 9 * 86_400_000),
});
const held = await db.query.reports.findFirst({ where: sql`id = 'rep_held'` });
if (!held) fail("the held report wasn't written");
if (held.spamReasons.length !== 2 || held.spamReasons[1] !== "advertising language (casino, backlink)") {
  fail(`spam_reasons didn't round-trip: ${JSON.stringify(held.spamReasons)}`);
}
if (held.spamScore !== 9) fail("spam_score didn't round-trip");

// A real one, and a second with the same text, for the velocity counts.
for (const n of [2, 3, 4]) {
  await db.insert(schema.reports).values({
    id: `rep_real_${n}`,
    orgId: "org_probe",
    projectId: "prj_probe",
    number: n,
    title: "Buy now",
    description: "Cheap stuff",
    ipHash: "hash_real",
    contentHash: hash,
  });
}
const v = await velocityFor("prj_probe", "hash_real", hash);
if (v.fromAddressThisHour !== 3) fail(`expected 3 this hour, got ${v.fromAddressThisHour}`);
if (v.fromAddressToday !== 3) fail(`expected 3 today, got ${v.fromAddressToday}`);
if (v.sameTextThisHour !== 3) fail(`expected 3 with the same text this hour, got ${v.sameTextThisHour}`);

// The blocklist, as the dashboard saves it.
await db.update(schema.projects).set({ protection: { spam: { threshold: 4 }, block: { ipHashes: ["hash_spam"], emails: ["a@b.com"] } } }).where(sql`id = 'prj_probe'`);
const project = await db.query.projects.findFirst({ where: sql`id = 'prj_probe'` });
if (project?.protection.block?.ipHashes?.[0] !== "hash_spam") fail("the block list didn't round-trip");
if (project?.protection.spam?.threshold !== 4) fail("the spam threshold didn't round-trip");

// Retention: the week-old hold-back goes, the real ones stay.
const result = await runRetention();
if (result.spam !== 1) fail(`retention should have deleted one held report, deleted ${result.spam}`);
const left = await db.execute<{ n: number }>(sql`select count(*)::int as n from reports where org_id = 'org_probe'`);
if (Number(left[0].n) !== 3) fail(`the three real reports should remain, found ${left[0].n}`);

await db.execute(sql`delete from organisations where id = 'org_probe'`);
console.log("intake and retention: every check passed against a real database");
process.exit(0);
