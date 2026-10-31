import { and, eq } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { notifyWithDefaults, type NotifyPrefs, type Priority } from "../db/schema";
import { queueNotice } from "./notices";
import { systemMailAvailable } from "./system";

/**
 * Telling the team. Issueit is a pipeline, and a pipeline nobody is told
 * about is one you have to remember to go and look at.
 *
 * Everything here is per person per organisation, and everything is quiet by
 * default beyond critical reports: the fastest way to make people ignore
 * Issueit's email is to send too much of it.
 */

type Report = typeof schema.reports.$inferSelect;
type Project = typeof schema.projects.$inferSelect;

const rank: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const floor: Record<NotifyPrefs["reports"], number> = { off: 99, critical: rank.critical, high: rank.high, all: 0 };

type Member = { userId: string; email: string; prefs: NotifyPrefs };

async function membersOf(orgId: string): Promise<Member[]> {
  const rows = await db
    .select({ userId: schema.users.id, email: schema.users.email, preferences: schema.memberships.preferences })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, orgId));
  return rows.map((r) => ({ userId: r.userId, email: r.email, prefs: notifyWithDefaults(r.preferences) }));
}

/** A report that just arrived, to whoever asked for reports of that weight. */
export async function notifyAboutReport(report: Report, project: Project) {
  if (!systemMailAvailable()) return;
  // A duplicate joining an open group isn't news; the group's lead already was.
  if (report.groupId) return;
  const members = await membersOf(report.orgId);
  const wanted = members.filter((m) => rank[report.priority] >= floor[m.prefs.reports] && !m.prefs.mutedProjects.includes(project.id));
  if (!wanted.length) return;
  const url = `${config.appUrl}/projects/${project.id}/reports/${report.id}`;
  await Promise.all(
    wanted.map((m) =>
      queueNotice({
        to: m.email,
        kind: "report",
        orgId: report.orgId,
        userId: m.userId,
        dedupeKey: `report:${report.id}:${m.userId}`,
        context: {
          title: report.title,
          number: report.number,
          priority: report.priority,
          projectName: project.name,
          page: report.pageUrl,
          reporter: report.reporterName || report.reporterEmail,
          url,
        },
      }),
    ),
  );
}

/** A destination Issueit had to pause. Nobody notices a queue filling up on their own. */
export async function notifyPipelinePaused(destination: typeof schema.destinations.$inferSelect, reason: string) {
  if (!systemMailAvailable()) return;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, destination.projectId), columns: { id: true, name: true } });
  const members = (await membersOf(destination.orgId)).filter((m) => m.prefs.pipeline && !m.prefs.mutedProjects.includes(destination.projectId));
  if (!members.length) return;
  await Promise.all(
    members.map((m) =>
      queueNotice({
        to: m.email,
        kind: "pipeline",
        orgId: destination.orgId,
        userId: m.userId,
        // Once a day per destination at most, however many times it trips.
        dedupeKey: `pipeline:${destination.id}:${new Date().toISOString().slice(0, 10)}`,
        context: {
          destinationName: destination.name,
          projectName: project?.name ?? "a project",
          reason,
          url: `${config.appUrl}/projects/${destination.projectId}/integrations`,
        },
      }),
    ),
  );
}

/** Whether anyone in this organisation wants a digest, and which. */
export async function digestAudience(orgId: string, period: "daily" | "weekly"): Promise<Member[]> {
  return (await membersOf(orgId)).filter((m) => m.prefs.digest === period);
}

/** One member's notification settings, for the settings page. */
export async function prefsFor(orgId: string, userId: string): Promise<NotifyPrefs> {
  const row = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)),
    columns: { preferences: true },
  });
  return notifyWithDefaults(row?.preferences);
}
