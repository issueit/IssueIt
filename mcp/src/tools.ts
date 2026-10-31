import { z } from "zod";
import type { IssueitClient } from "./client";
import { analyticsSummary, deliveryTable, destinationTable, fence, renderReport, reportTable, type ReportDetail, type ReportListItem } from "./render";
import { installSnippet, snippetLanguage } from "./snippets";

/**
 * Every tool the Issueit MCP server offers. Each one is a thin, named verb
 * over the management API, because a model chooses better from eighteen
 * clear tools than from a mirror of every endpoint.
 */

export type ToolResult = { text: string; data?: Record<string, unknown> };

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run(c: IssueitClient, args: any): Promise<ToolResult>;
};

const tool = (t: ToolDef) => t;
const read = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const project = z.string().describe("A project id (prj_…) or its name.");
const reportRef = z.string().describe('A report id (rep_…) or its number in a project, e.g. "14".');

export const tools: ToolDef[] = [
  /* ----------------------------------------------------------- orientation */
  tool({
    name: "whoami",
    title: "Who this token is",
    description:
      "Start here. Reports which organisation this token belongs to, which projects it can see, and which scopes it holds, so you know what you may do before you try.",
    input: {},
    annotations: read,
    async run(c) {
      const me = await c.whoami(true);
      const scopes = me.auth.scopes === "all" ? "everything (signed-in person)" : me.auth.scopes.join(", ");
      return {
        text: [
          `${me.user.name} <${me.user.email}> in **${me.organisation.name}** as ${me.organisation.role}.`,
          `Scopes: ${scopes}`,
          `Projects: ${me.projects.map((p) => `${p.name} (${p.id})`).join(", ") || "none yet"}`,
          `Dashboard: ${me.urls.app}`,
        ].join("\n"),
        data: me as unknown as Record<string, unknown>,
      };
    },
  }),

  /* --------------------------------------------------------------- reports */
  tool({
    name: "search_reports",
    title: "Search bug reports",
    description:
      "Lists bug reports newest first, with their delivery state. Use it to find what to work on. Duplicates are folded into the report they joined, so each row is one distinct bug.",
    input: {
      project: project.optional(),
      status: z.enum(["open", "new", "investigating", "resolved", "closed", "all"]).default("open").describe('"open" means new or investigating.'),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      q: z.string().optional().describe("Matches the title, description or reporter's email."),
      since: z.string().optional().describe("ISO date or timestamp; only reports from then on."),
      failing: z.boolean().optional().describe("Only reports a destination failed to deliver."),
      limit: z.number().int().min(1).max(50).default(20),
      cursor: z.string().optional().describe("From a previous call's nextCursor."),
    },
    annotations: read,
    async run(c, a) {
      const params = new URLSearchParams({ status: a.status, limit: String(a.limit) });
      if (a.project) params.set("project", (await c.project(a.project)).id);
      if (a.priority) params.set("priority", a.priority);
      if (a.q) params.set("q", a.q);
      if (a.since) params.set("since", a.since);
      if (a.failing) params.set("delivery", "failed");
      if (a.cursor) params.set("cursor", a.cursor);
      const res = await c.get<{ reports: ReportListItem[]; nextCursor: string | null }>(`/reports?${params}`);
      const more = res.nextCursor ? `\n\n_More to come: pass cursor "${res.nextCursor}"._` : "";
      return { text: `${reportTable(res.reports)}${more}`, data: res as unknown as Record<string, unknown> };
    },
  }),

  tool({
    name: "get_report",
    title: "Read a bug report in full",
    description:
      "Everything about one report: what the person said, the console errors, network requests and clicks the widget captured just before they sent it, the attachments, and where it was delivered. This is usually enough to reproduce and fix the bug.",
    input: { report: reportRef, project: project.optional().describe("Needed when you give a number rather than an id.") },
    annotations: read,
    async run(c, a) {
      const id = await c.reportId(a.report, a.project);
      const detail = await c.get<ReportDetail>(`/reports/${id}`);
      const { urls } = await c.whoami();
      return { text: renderReport(detail, urls.app), data: detail as unknown as Record<string, unknown> };
    },
  }),

  tool({
    name: "update_report",
    title: "Change a report's status or priority",
    description: "Sets a report's status or priority. To mark one fixed, prefer resolve_report, which also tells anyone who asked to hear about it.",
    input: {
      report: reportRef,
      project: project.optional(),
      status: z.enum(["new", "investigating", "resolved", "closed"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    },
    annotations: write,
    async run(c, a) {
      if (!a.status && !a.priority) return { text: "Nothing to change: give a status, a priority, or both." };
      const id = await c.reportId(a.report, a.project);
      const res = await c.call<{ report: Record<string, any> }>("PATCH", `/reports/${id}`, { status: a.status, priority: a.priority });
      return { text: `#${res.report.number} is now ${res.report.status}, ${res.report.priority} priority.`, data: res };
    },
  }),

  tool({
    name: "resolve_report",
    title: "Mark a bug fixed",
    description:
      "Marks a report resolved, which also resolves every duplicate that joined it and emails the people who asked to hear when it was fixed. Use this once your fix is shipped, not when you start.",
    input: { report: reportRef, project: project.optional() },
    annotations: { ...write, idempotentHint: true },
    async run(c, a) {
      const id = await c.reportId(a.report, a.project);
      const res = await c.call<{ report: Record<string, any> }>("PATCH", `/reports/${id}`, { status: "resolved" });
      const n = res.report.duplicateCount ?? 0;
      return { text: `#${res.report.number} resolved${n ? `, along with the ${n} duplicate${n === 1 ? "" : "s"} grouped with it` : ""}.`, data: res };
    },
  }),

  tool({
    name: "group_reports",
    title: "Mark one report a duplicate of another",
    description: "Files a report under another one as the same bug. Issueit groups obvious duplicates itself; use this for two descriptions of one bug that don't look alike.",
    input: { report: reportRef, into: z.number().int().min(1).describe("The number of the report to join."), project: project.optional() },
    annotations: write,
    async run(c, a) {
      const id = await c.reportId(a.report, a.project);
      await c.call("POST", `/reports/${id}/group`, { into: a.into });
      return { text: `Grouped into #${a.into}.` };
    },
  }),

  tool({
    name: "separate_report",
    title: "Take a report out of its group",
    description: "Removes a report from the group it joined and delivers it on its own, for when two different bugs were merged by mistake.",
    input: { report: reportRef, project: project.optional() },
    annotations: write,
    async run(c, a) {
      const id = await c.reportId(a.report, a.project);
      const res = await c.call<{ report: Record<string, any> }>("POST", `/reports/${id}/separate`, {});
      return { text: `#${res.report.number} stands on its own again and has been sent to its destinations.`, data: res };
    },
  }),

  tool({
    name: "create_report",
    title: "File a bug report",
    description:
      "Files a report into a project, as though it came from the widget: it is fingerprinted, grouped with duplicates and delivered to that project's destinations. Use it to report a bug you found while working, or from a failing test.",
    input: {
      project,
      title: z.string().max(200),
      description: z.string().max(20000).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      environment: z.string().max(40).optional(),
      page_url: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Anything else worth keeping: a commit, a test name, a user id."),
      fingerprint: z.string().max(200).optional().describe("Your own grouping key; reports sharing one are treated as the same bug."),
      key: z.string().optional().describe("A project secret key (sk_live_…), if the project refuses anonymous reports."),
    },
    annotations: { ...write, openWorldHint: true },
    async run(c, a) {
      const p = await c.project(a.project);
      const res = await c.submit(
        p.id,
        {
          title: a.title,
          description: a.description,
          priority: a.priority,
          environment: a.environment,
          page_url: a.page_url,
          metadata: a.metadata,
          fingerprint: a.fingerprint,
          source: "agent",
        },
        a.key,
      );
      const { urls } = await c.whoami();
      return { text: `Filed in ${p.name}: ${urls.app}/inbox/${res.report_id}`, data: res as unknown as Record<string, unknown> };
    },
  }),

  /* ----------------------------------------------------------------- setup */
  tool({
    name: "setup_project",
    title: "Set up bug reporting for an app",
    description:
      "Creates a project and hands back everything needed to start collecting bugs: the public project id, the intake endpoint, the hosted form, and the snippet to paste in. Safe to call twice: an existing project with the same name is returned as it is.",
    input: {
      name: z.string().max(60).describe("What the app is called."),
      description: z.string().max(200).optional(),
      framework: z.enum(["html", "react", "next", "vue", "svelte", "node", "curl"]).default("html"),
      with_key: z.boolean().default(false).describe("Also mint a server-side secret key. Needs the keys:write scope."),
    },
    annotations: { ...write, idempotentHint: true },
    async run(c, a) {
      const me = await c.whoami(true);
      const existing = me.projects.find((p) => p.name.toLowerCase() === a.name.trim().toLowerCase());
      let id = existing?.id;
      if (!id) {
        const made = await c.call<{ project: { id: string } }>("POST", "/projects", { name: a.name.trim(), description: a.description });
        id = made.project.id;
      }
      const detail = await c.get<{ project: Record<string, any>; links: Record<string, string> }>(`/projects/${id}`);
      let key: string | null = null;
      let keyProblem: string | null = null;
      if (a.with_key) {
        try {
          const made = await c.call<{ key: string }>("POST", `/projects/${id}/keys`, { name: "Created by an agent" });
          key = made.key;
        } catch (err) {
          // Minting an ingest key needs keys:write; say so rather than failing the setup.
          keyProblem = (err as Error).message;
        }
      }
      const snippet = installSnippet(a.framework, id, detail.links);
      await c.whoami(true);
      return {
        text: [
          existing ? `**${detail.project.name}** already existed, so nothing was changed.` : `Created **${detail.project.name}**.`,
          ``,
          `- Project id (safe to put in a web page): \`${id}\``,
          `- Intake endpoint: ${detail.links.endpoint}`,
          `- Hosted form, if you'd rather link than embed: ${detail.links.formUrl}`,
          key ? `- Secret key for your server, store it as ISSUEIT_SECRET_KEY: \`${key}\`` : keyProblem ? `- No secret key: ${keyProblem}` : null,
          ``,
          `## Install (${a.framework})`,
          fence(snippet, snippetLanguage(a.framework)),
          ``,
          `Next: call create_destination to send these reports somewhere a person will see them, then diagnose_install once the app is deployed.`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
        data: { project: detail.project, links: detail.links, key, keyProblem, snippet },
      };
    },
  }),

  tool({
    name: "get_install_snippet",
    title: "Get the code that collects bugs",
    description: "The snippet that puts the Issueit widget, or a direct API call, into an app you already have a project for.",
    input: { project, framework: z.enum(["html", "react", "next", "vue", "svelte", "node", "curl"]).default("html") },
    annotations: read,
    async run(c, a) {
      const p = await c.project(a.project);
      const detail = await c.get<{ links: Record<string, string> }>(`/projects/${p.id}`);
      const snippet = installSnippet(a.framework, p.id, detail.links);
      return { text: fence(snippet, snippetLanguage(a.framework)), data: { snippet, links: detail.links } };
    },
  }),

  tool({
    name: "configure_widget",
    title: "Change how the report form looks and behaves",
    description:
      "Changes the widget for a project: its button, position, theme, which questions it asks, and what diagnostics it captures. Only the settings you name are changed. Read the project first if you want to see every option.",
    input: {
      project,
      settings: z.record(z.string(), z.unknown()).describe('A partial widget configuration, e.g. { "position": "bottom-left", "askPriority": true, "collectEmail": "required" }.'),
    },
    annotations: write,
    async run(c, a) {
      const p = await c.project(a.project);
      const res = await c.call<{ project: { widget: Record<string, unknown> } }>("PATCH", `/projects/${p.id}`, { widget: a.settings });
      const changed = Object.keys(a.settings);
      return { text: `Updated ${changed.length} setting${changed.length === 1 ? "" : "s"} on ${p.name}: ${changed.join(", ")}.`, data: res };
    },
  }),

  tool({
    name: "diagnose_install",
    title: "Check a project is set up properly",
    description:
      "Looks over a project the way a person would before launch: has anything arrived, will the widget be allowed on the site, is anyone being told, and is delivery healthy. Returns the problems it found, worst first.",
    input: { project, url: z.string().optional().describe("The address the widget will run on, to check against the allowed sites.") },
    annotations: read,
    async run(c, a) {
      const p = await c.project(a.project);
      const [detail, destinations, reports] = await Promise.all([
        c.get<{ project: Record<string, any>; links: Record<string, string>; stats: { total: number; open: number; week: number } }>(`/projects/${p.id}`),
        c.get<{ destinations: Array<Record<string, any>> }>(`/projects/${p.id}/destinations`),
        c.get<{ reports: ReportListItem[] }>(`/reports?project=${p.id}&status=all&limit=1`),
      ]);
      const problems: string[] = [];
      const notes: string[] = [];
      const pr = detail.project;

      if (!reports.reports.length) problems.push("No report has ever arrived. The widget may not be installed, or not reaching the endpoint.");
      else notes.push(`Last report arrived ${reports.reports[0].createdAt.slice(0, 10)}.`);

      const live = destinations.destinations.filter((d) => d.enabled);
      if (!live.length) problems.push("No destination is enabled, so reports are stored but nobody is told. Add one with create_destination.");
      const paused = destinations.destinations.filter((d) => d.pausedReason);
      for (const d of paused) problems.push(`Destination "${d.name}" is paused: ${d.pausedReason}.`);
      const failing = live.filter((d) => (d.stats?.weekFailed ?? 0) > 0 && !(d.stats?.weekDelivered ?? 0));
      for (const d of failing) problems.push(`Destination "${d.name}" has failed every delivery this week: ${d.stats?.lastError ?? "no reason recorded"}.`);

      if (a.url) {
        try {
          const origin = new URL(a.url.includes("://") ? a.url : `https://${a.url}`).origin;
          if (pr.allowedOrigins?.length && !pr.allowedOrigins.includes(origin)) {
            problems.push(`${origin} isn't in this project's allowed sites (${pr.allowedOrigins.join(", ")}), so the browser's report would be refused.`);
          } else if (!pr.allowedOrigins?.length) {
            notes.push("No allowed sites are set, so reports are accepted from anywhere. Set them before launch.");
          }
        } catch {
          problems.push(`"${a.url}" isn't a valid address.`);
        }
      } else if (!pr.allowedOrigins?.length) {
        notes.push("No allowed sites are set, so reports are accepted from anywhere. Set them before launch.");
      }

      // A release whose stacks are still minified is the quiet one: reports
      // arrive, they just aren't usable.
      const latest = reports.reports[0];
      if (latest) {
        try {
          const full = await c.get<{ report: { release: string | null; diagnostics: { console?: Array<{ stack?: string; original?: string }> } } }>(`/reports/${latest.id}`);
          const minified = (full.report.diagnostics.console ?? []).some((e) => e.stack && !e.original && /\.[cm]?js:\d+:\d+/.test(e.stack));
          if (minified) {
            problems.push(
              full.report.release
                ? `Stacks on release "${full.report.release}" are still minified. Upload that build's source maps (issueit sourcemaps upload) and they'll read as your own files.`
                : "Stacks are minified and reports don't name a release, so they can't be mapped back. Send a \"release\" with each report and upload that build's source maps.",
            );
          }
        } catch {
          // A report that vanished between the two calls isn't worth failing over.
        }
      }

      if (!pr.publicSubmissions) notes.push("Anonymous reports are off, so the widget needs a secret key, which must never go in a web page.");
      if (!pr.widget?.sendContext) notes.push("The widget doesn't send page context, which makes reports harder to act on.");
      if (!pr.widget?.captureConsole) notes.push("Console capture is off, so reports won't carry the errors that caused them.");
      if (!pr.emails?.enabled) notes.push("Reporters aren't emailed, so nobody hears back when their bug is fixed.");

      return {
        text: [
          `## ${pr.name}`,
          `${detail.stats.total} reports, ${detail.stats.open} open, ${detail.stats.week} this week. ${live.length} destination${live.length === 1 ? "" : "s"} enabled.`,
          ``,
          problems.length ? `### Problems\n${problems.map((x) => `- ${x}`).join("\n")}` : `### Problems\nNone found.`,
          notes.length ? `\n### Worth knowing\n${notes.map((x) => `- ${x}`).join("\n")}` : "",
        ].join("\n"),
        data: { problems, notes, project: pr, destinations: destinations.destinations },
      };
    },
  }),

  tool({
    name: "preview_report",
    title: "See what a report would do, without filing it",
    description:
      "Validates a report, scrubs it, works out its fingerprint, and says which destinations would receive it and whether it would join an existing group — then stores nothing. Use it to check a fingerprint or a routing rule before trusting it.",
    input: {
      project,
      title: z.string().max(200),
      description: z.string().max(20000).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      environment: z.string().max(40).optional(),
      page_url: z.string().optional(),
      fingerprint: z.string().max(200).optional(),
      key: z.string().optional().describe("A project secret key, if the project refuses anonymous reports."),
    },
    annotations: read,
    async run(c, a) {
      const p = await c.project(a.project);
      const { project: _p, key, ...report } = a;
      const res = await c.submit(p.id, { ...report, source: "agent" }, key, { dryRun: true });
      const r = res as Record<string, any>;
      const routed = (r.destinations ?? []) as Array<{ name: string; provider: string; would_deliver: boolean; why: string | null }>;
      return {
        text: [
          `Nothing was stored. If this were filed in ${p.name}:`,
          ``,
          `- Fingerprint: \`${r.fingerprint ?? "none, so it wouldn't group"}\``,
          r.duplicate_of ? `- It would join #${r.duplicate_of.number} ("${r.duplicate_of.title}"), seen ${r.duplicate_of.seen} times` : `- It would start its own group`,
          `- Priority ${r.report?.priority}, source ${r.report?.source}`,
          ``,
          routed.length
            ? `**Destinations**\n${routed.map((d) => `- ${d.name} (${d.provider}): ${d.would_deliver ? "would receive it" : `no — ${d.why}`}`).join("\n")}`
            : `_No destination is enabled, so nobody would be told._`,
        ].join("\n"),
        data: r,
      };
    },
  }),

  /* ------------------------------------------------- settings as a file */
  tool({
    name: "export_project_config",
    title: "Read a project's settings as a document",
    description:
      "Everything that decides how a project behaves — widget, allowed sites, grouping and redaction rules, destinations — with no ids in it, so it can be committed to a repository and applied to another environment.",
    input: { project, secrets: z.boolean().default(false).describe("Include webhook URLs. Needs destinations:write.") },
    annotations: read,
    async run(c, a) {
      const p = await c.project(a.project);
      const { config } = await c.get<{ config: Record<string, unknown> }>(`/projects/${p.id}/config${a.secrets ? "?secrets=1" : ""}`);
      return { text: `${p.name}, as a document:\n\n${fence(JSON.stringify(config, null, 2), "json")}`, data: { config } };
    },
  }),

  tool({
    name: "apply_project_config",
    title: "Apply a settings document to a project",
    description:
      "Applies a document from export_project_config. Always says what it would change first; pass confirm to make the change. Destinations are matched by name and connections by account, so the same document works in staging and production.",
    input: {
      project,
      config: z.record(z.string(), z.unknown()).describe("The document, as export_project_config returned it."),
      confirm: z.boolean().default(false).describe("Without this, nothing is changed and you only get the difference."),
      prune: z.boolean().default(false).describe("Also remove destinations the document doesn't mention."),
    },
    annotations: { ...write, destructiveHint: true },
    async run(c, a) {
      const p = await c.project(a.project);
      const plan = await c.call<{ changes: string[]; problems: string[]; wouldRemove: string[] }>("POST", `/projects/${p.id}/config`, {
        config: a.config,
        dryRun: true,
        prune: a.prune,
      });
      const describe = [
        plan.changes.length ? `**Changes**\n${plan.changes.map((x) => `- ${x}`).join("\n")}` : "Nothing would change.",
        plan.problems.length ? `\n**Problems to fix first**\n${plan.problems.map((x) => `- ${x}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (!a.confirm) return { text: `${describe}\n\n_Nothing was changed. Call again with confirm: true._`, data: plan };
      if (plan.problems.length) return { text: `${describe}\n\n_Nothing was changed: fix the problems first._`, data: plan };
      const applied = await c.call<{ changes: string[]; removed: string[] }>("POST", `/projects/${p.id}/config`, { config: a.config, dryRun: false, prune: a.prune });
      return { text: `Applied ${applied.changes.length} change${applied.changes.length === 1 ? "" : "s"} to ${p.name}.\n\n${describe}`, data: applied };
    },
  }),

  /* ------------------------------------------------------- where bugs go */
  tool({
    name: "list_providers",
    title: "Find a service reports can be sent to",
    description:
      "Searches the services Issueit can deliver to — issue trackers, chat, help desks, on-call, email, spreadsheets, queues and plain webhooks — and says what each one needs before it can be connected.",
    input: { q: z.string().optional().describe("Search by name or keyword, e.g. 'jira', 'chat', 'oncall'."), limit: z.number().int().min(1).max(60).default(25) },
    annotations: read,
    async run(c, a) {
      const { providers } = await c.get<{ providers: Array<Record<string, any>> }>("/connections/providers");
      const q = a.q?.trim().toLowerCase();
      const matched = q
        ? providers.filter((p) => [p.id, p.name, p.category, p.summary, ...(p.keywords ?? [])].join(" ").toLowerCase().includes(q))
        : providers;
      const rows = matched.slice(0, a.limit).map((p) => {
        const how = p.oauth ? "sign in (OAuth)" : p.tokenFields?.length ? `token: ${p.tokenFields.map((f: any) => f.key).join(", ")}` : p.needsConnection ? "connect first" : "a URL";
        return `| ${p.name} | \`${p.id}\` | ${p.category} | ${how} | ${p.targetLabel ?? "—"} |`;
      });
      return {
        text: [
          `${matched.length} of ${providers.length} services match${q ? ` "${a.q}"` : ""}.`,
          "",
          "| Service | id | Kind | How to connect | Points at |",
          "| --- | --- | --- | --- | --- |",
          ...rows,
          matched.length > a.limit ? `\n_${matched.length - a.limit} more; narrow the search._` : "",
        ].join("\n"),
        data: { providers: matched.slice(0, a.limit) },
      };
    },
  }),

  tool({
    name: "list_connections",
    title: "List connected accounts",
    description: "The accounts this organisation has already connected, and what each one can deliver to. Connecting a new account needs a browser, so a person has to do that part in the dashboard.",
    input: { with_targets: z.boolean().default(false).describe("Also list each account's repositories, channels or lists.") },
    annotations: read,
    async run(c, a) {
      const { connections } = await c.get<{ connections: Array<Record<string, any>> }>("/connections");
      if (!connections.length) {
        const { urls } = await c.whoami();
        return { text: `No accounts are connected. A person can connect one at ${urls.app}/settings/connections, then you can point a destination at it.`, data: { connections } };
      }
      const lines: string[] = [];
      for (const conn of connections) {
        lines.push(`- **${conn.provider}** — ${conn.account?.label ?? conn.id} (\`${conn.id}\`)${conn.status === "error" ? ` — not working: ${conn.lastError ?? "unknown"}` : ""}`);
        if (a.with_targets) {
          try {
            const { targets } = await c.get<{ targets: Array<{ id: string; label: string; value: Record<string, unknown> }> }>(`/connections/${conn.id}/targets`);
            for (const t of targets.slice(0, 25)) lines.push(`    - ${t.label} → target ${JSON.stringify(t.value)}`);
          } catch (err) {
            lines.push(`    - couldn't list targets: ${(err as Error).message}`);
          }
        }
      }
      return { text: lines.join("\n"), data: { connections } };
    },
  }),

  tool({
    name: "list_destinations",
    title: "See where a project's reports go",
    description: "Every destination with its health: what has been delivered, what failed this week, and whether Issueit paused it.",
    input: { project: project.optional().describe("Leave out for every destination in the organisation.") },
    annotations: read,
    async run(c, a) {
      const path = a.project ? `/projects/${(await c.project(a.project)).id}/destinations` : "/destinations";
      const { destinations } = await c.get<{ destinations: Array<Record<string, any>> }>(path);
      return { text: destinationTable(destinations), data: { destinations } };
    },
  }),

  tool({
    name: "create_destination",
    title: "Send a project's reports somewhere",
    description:
      "Points a project's reports at a tracker, a chat channel or a webhook. For anything but a webhook you need a connected account first: call list_connections, and list_providers to see what a target looks like. Test it afterwards with test_destination.",
    input: {
      project,
      provider: z.string().describe('The service id from list_providers, e.g. "github", "slack", "webhook".'),
      connectionId: z.string().optional().describe("From list_connections. Not needed for a webhook."),
      target: z.record(z.string(), z.unknown()).default({}).describe('Where in that service, e.g. { "repo": "acme/web" } or { "channel": "C123" }.'),
      url: z.string().optional().describe("For a webhook destination: where to POST."),
      name: z.string().max(80).optional(),
      events: z.array(z.enum(["report.created", "report.updated", "report.resolved", "report.closed", "report.duplicate"])).optional(),
      labels: z.array(z.string()).optional().describe("Labels to put on issues this creates."),
      rule: z
        .object({ priorities: z.array(z.string()).optional(), sources: z.array(z.string()).optional(), environments: z.array(z.string()).optional() })
        .optional()
        .describe("Only send reports that match, e.g. only critical ones from production."),
    },
    annotations: write,
    async run(c, a) {
      const p = await c.project(a.project);
      const res = await c.call<{ destination: Record<string, any>; signingSecret: string | null }>("POST", `/projects/${p.id}/destinations`, {
        provider: a.provider,
        connectionId: a.connectionId,
        target: a.target,
        url: a.url,
        name: a.name,
        events: a.events,
        labels: a.labels,
        rule: a.rule,
      });
      return {
        text: [
          `Added **${res.destination.name}** to ${p.name}. It will receive ${(res.destination.events ?? []).join(", ")}.`,
          res.signingSecret ? `\nWebhook signing secret, shown once — verify every request with it:\n\`${res.signingSecret}\`` : null,
          `\nRun test_destination next to prove it works before a real bug arrives.`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
        data: res,
      };
    },
  }),

  tool({
    name: "update_destination",
    title: "Change or pause a destination",
    description: "Changes a destination's name, events, routing rule or target, or turns it off without deleting it.",
    input: {
      project,
      destination: z.string().describe("The destination id (dst_…)."),
      enabled: z.boolean().optional(),
      name: z.string().max(80).optional(),
      events: z.array(z.enum(["report.created", "report.updated", "report.resolved", "report.closed", "report.duplicate"])).optional(),
      target: z.record(z.string(), z.unknown()).optional(),
      rule: z.object({ priorities: z.array(z.string()).optional(), sources: z.array(z.string()).optional(), environments: z.array(z.string()).optional() }).optional(),
    },
    annotations: write,
    async run(c, a) {
      const p = await c.project(a.project);
      const { project: _p, destination, ...changes } = a;
      const res = await c.call<{ destination: Record<string, any> }>("PATCH", `/projects/${p.id}/destinations/${destination}`, changes);
      return { text: `Updated ${res.destination.name}${a.enabled === false ? " and turned it off" : ""}.`, data: res };
    },
  }),

  tool({
    name: "test_destination",
    title: "Send a test report to a destination",
    description: "Delivers a clearly marked test report through a destination's real settings and waits for the outcome, so you find out now rather than when a real bug arrives.",
    input: { project, destination: z.string().describe("The destination id (dst_…).") },
    annotations: { ...write, idempotentHint: true, openWorldHint: true },
    async run(c, a) {
      const p = await c.project(a.project);
      const res = await c.call<{ ok: boolean; error?: string; externalUrl?: string | null }>("POST", `/projects/${p.id}/destinations/${a.destination}/test`, {});
      return { text: res.ok ? `It works. ${res.externalUrl ? `The test landed at ${res.externalUrl}` : "The service accepted the test report."}` : `It failed: ${res.error}`, data: res };
    },
  }),

  /* -------------------------------------------------------------- delivery */
  tool({
    name: "list_deliveries",
    title: "Read the delivery log",
    description: "Every attempt to hand a report to a destination, with the error when it failed. Use it to work out why a bug never reached the tracker.",
    input: {
      project: project.optional(),
      status: z.enum(["pending", "delivering", "delivered", "retrying", "failed"]).optional(),
      destination: z.string().optional(),
      provider: z.string().optional(),
      q: z.string().optional().describe("Matches the report's title or the error."),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: read,
    async run(c, a) {
      const params = new URLSearchParams({ limit: String(a.limit) });
      if (a.project) params.set("project", (await c.project(a.project)).id);
      for (const k of ["status", "destination", "provider", "q"] as const) if (a[k]) params.set(k, a[k]);
      const { deliveries } = await c.get<{ deliveries: Array<Record<string, any>> }>(`/deliveries?${params}`);
      return { text: deliveryTable(deliveries), data: { deliveries } };
    },
  }),

  tool({
    name: "retry_delivery",
    title: "Try a failed delivery again",
    description: "Queues another attempt for one delivery, or for every failed delivery that matches. Fix the destination first, or it will fail the same way.",
    input: {
      delivery: z.string().optional().describe("One delivery id (dlv_…). Leave out to retry everything that failed."),
      project: project.optional().describe("With no delivery id, limits the retry to one project."),
      destination: z.string().optional(),
      provider: z.string().optional(),
    },
    annotations: { ...write, openWorldHint: true },
    async run(c, a) {
      if (a.delivery) {
        await c.call("POST", `/deliveries/${a.delivery}/retry`, {});
        return { text: `Queued ${a.delivery} for another attempt.` };
      }
      const res = await c.call<{ queued: number }>("POST", "/deliveries/retry-failed", {
        project: a.project ? (await c.project(a.project)).id : undefined,
        destination: a.destination,
        provider: a.provider,
      });
      return { text: res.queued ? `Queued ${res.queued} failed deliver${res.queued === 1 ? "y" : "ies"}.` : "Nothing was waiting to be retried.", data: res };
    },
  }),

  /* --------------------------------------------------------------- insight */
  tool({
    name: "get_health",
    title: "Is delivery keeping up?",
    description:
      "Queue depth, how long the oldest delivery has been waiting, paused destinations and the day's failure rate. Check this when reports seem to be arriving but nobody is hearing about them.",
    input: {},
    annotations: read,
    async run(c) {
      const h = await c.get<{
        status: string;
        problems: string[];
        deliveries: Record<string, number | null>;
        destinations: Record<string, number>;
        emails: Record<string, number>;
        reports: Record<string, number>;
      }>("/health");
      return {
        text: [
          `**${h.status}**`,
          ...h.problems.map((p) => `- ${p}`),
          ``,
          `Deliveries: ${h.deliveries.pending} waiting, ${h.deliveries.retrying} retrying, ${h.deliveries.failedLastDay} failed today, ${h.deliveries.deliveredLastDay} delivered today.`,
          h.deliveries.oldestWaitingSeconds ? `The oldest has been waiting ${Math.round((h.deliveries.oldestWaitingSeconds as number) / 60)} minutes.` : "",
          `Destinations: ${h.destinations.enabled} enabled, ${h.destinations.paused} paused. Reports today: ${h.reports.lastDay}.`,
        ]
          .filter(Boolean)
          .join("\n"),
        data: h,
      };
    },
  }),

  tool({
    name: "get_analytics",
    title: "Counts, trends and delivery health",
    description: "How many bugs came in, from where, on which pages and browsers, and how delivery is holding up. Use it to decide what to fix, not just what was reported last.",
    input: {
      range: z.enum(["24h", "7d", "30d", "90d", "12m"]).default("30d"),
      project: project.optional(),
    },
    annotations: read,
    async run(c, a) {
      const params = new URLSearchParams({ range: a.range, tz: "UTC" });
      if (a.project) params.set("project", (await c.project(a.project)).id);
      const analytics = await c.get<Record<string, any>>(`/analytics?${params}`);
      return { text: analyticsSummary(analytics), data: analytics };
    },
  }),
];
