import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { publish } from "../lib/events";
import { body, type AppEnv } from "../http";
import { enqueueReportEvent } from "../delivery/queue";

/**
 * The first ten minutes. A new organisation lands on an empty dashboard, and
 * an empty dashboard doesn't tell you what Issueit wants from you next.
 *
 * Each step is worked out from what exists rather than from a flag somebody
 * has to remember to set, so it is right after a project is deleted, right
 * for someone who joined an organisation that was already set up, and
 * impossible to leave stale.
 */

export const onboardingRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const [state] = await db.execute<{
      projects: number;
      reports: number;
      real_reports: number;
      destinations: number;
      delivered: number;
      members: number;
      first_project: string | null;
      project_name: string | null;
    }>(sql`
      select
        (select count(*) from projects where org_id = ${orgId})::int as projects,
        (select count(*) from reports where org_id = ${orgId})::int as reports,
        (select count(*) from reports where org_id = ${orgId} and source <> 'test')::int as real_reports,
        (select count(*) from destinations where org_id = ${orgId})::int as destinations,
        (select count(*) from deliveries where org_id = ${orgId} and status = 'delivered')::int as delivered,
        (select count(*) from memberships where org_id = ${orgId})::int as members,
        (select id from projects where org_id = ${orgId} order by created_at limit 1) as first_project,
        (select name from projects where org_id = ${orgId} order by created_at limit 1) as project_name`);

    const project = state.first_project;
    const steps = [
      {
        id: "project",
        title: "Create a project",
        hint: "One product, one site, one app. Reports and destinations belong to it.",
        done: state.projects > 0,
        href: "/projects",
      },
      {
        id: "install",
        title: "Collect your first report",
        hint: "Paste the widget snippet into your site, or send one with the API.",
        done: state.reports > 0,
        href: project ? `/projects/${project}/widget` : "/projects",
      },
      {
        id: "destination",
        title: "Send reports somewhere",
        hint: "GitHub, Linear, Slack, email, a webhook — anywhere your team already looks.",
        done: state.destinations > 0,
        href: project ? `/projects/${project}/integrations` : "/integrations",
      },
      {
        id: "delivered",
        title: "Watch one arrive",
        hint: "A report delivered to a real destination means the pipeline works end to end.",
        done: state.delivered > 0,
        href: "/integrations/log",
      },
      {
        id: "team",
        title: "Invite the people who fix things",
        hint: "Optional, but bug reports nobody reads aren't much use.",
        done: state.members > 1,
        href: "/settings/members",
        optional: true,
      },
    ];

    return c.json({
      steps,
      done: steps.filter((s) => s.done).length,
      total: steps.length,
      /** True once the essential steps are behind you, so the dashboard can drop the card. */
      complete: steps.filter((s) => !s.optional).every((s) => s.done),
      waitingForFirstReport: state.projects > 0 && state.real_reports === 0,
      firstProject: project ? { id: project, name: state.project_name } : null,
    });
  })
  /**
   * A sample report, so the whole pipeline can be seen working before real
   * users are involved. Marked as a test, and deletable like any other.
   */
  .post("/test-report", async (c) => {
    const input = await body(c, z.object({ project: z.string() }));
    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, input.project), eq(schema.projects.orgId, c.get("orgId"))),
    });
    if (!project) throw notFound("That project");
    const existing = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from reports where project_id = ${project.id} and source = 'test' and created_at > now() - interval '1 hour'`,
    );
    if ((existing[0]?.n ?? 0) >= 3) throw badRequest("That's three test reports in an hour. Delete one before sending another.");

    const report = await db.transaction(async (tx) => {
      const [seq] = await tx
        .update(schema.projects)
        .set({ reportSeq: sql`${schema.projects.reportSeq} + 1`, lastReportAt: new Date() })
        .where(eq(schema.projects.id, project.id))
        .returning({ n: schema.projects.reportSeq });
      const [row] = await tx
        .insert(schema.reports)
        .values({
          id: newId("rep"),
          orgId: project.orgId,
          projectId: project.id,
          number: seq.n,
          title: "Test report from Issueit",
          description:
            "Somebody in your team sent this from the dashboard to check that reports arrive and get delivered. It behaves like a real report, so you can resolve it, delete it, or watch where it goes.",
          priority: "low",
          source: "test",
          environment: "test",
          pageUrl: `${config.appUrl}/projects/${project.id}`,
          context: { browser: "Issueit", os: "Issueit" },
          metadata: { sentBy: c.get("user").name || c.get("user").email },
        })
        .returning();
      return row;
    });

    try {
      await enqueueReportEvent(report, "report.created");
    } catch (err) {
      console.error("[onboarding] couldn't queue the test report's deliveries", err);
    }
    await publish({ type: "report.created", orgId: report.orgId, projectId: report.projectId, reportId: report.id }).catch(() => {});
    return c.json({ report: { id: report.id, number: report.number } }, 201);
  });
