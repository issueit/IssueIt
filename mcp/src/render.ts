/**
 * Turns Issueit's JSON into the Markdown a model reads best: the facts
 * first, then the evidence the widget captured, then where the report went.
 * Structured data goes alongside it, so clients that render JSON still can.
 */

export type ReportListItem = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  source: string;
  environment: string | null;
  reporterEmail: string | null;
  createdAt: string;
  duplicateCount: number;
  lastSeenAt: string | null;
  projectId: string;
  projectName: string;
  attachmentCount: number;
  delivered: number;
  failed: number;
  pending: number;
};

export type ReportDetail = {
  report: Record<string, any>;
  attachments: Array<Record<string, any>>;
  deliveries: Array<Record<string, any>>;
  group: Record<string, any> | null;
  duplicates: Array<Record<string, any>>;
  emails: Array<Record<string, any>>;
};

/* ------------------------------------------------------------------ pieces */

export const ago = (iso: string | null | undefined): string => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return String(iso);
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** A table a model can scan, with the columns it needs to choose what to open. */
export function reportTable(reports: ReportListItem[]): string {
  if (!reports.length) return "No reports match.";
  const rows = reports.map((r) => {
    const flags = [r.duplicateCount ? `×${r.duplicateCount + 1}` : "", r.failed ? `${r.failed} failed` : "", r.attachmentCount ? `${r.attachmentCount} files` : ""].filter(Boolean);
    return `| ${r.projectName} #${r.number} | ${r.title.replace(/\|/g, "\\|").slice(0, 70)} | ${r.status} | ${r.priority} | ${ago(r.createdAt)} | ${flags.join(", ") || "—"} |`;
  });
  return ["| Report | Title | Status | Priority | Seen | Notes |", "| --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
}

/* ------------------------------------------------------------- one report */

export function renderReport(d: ReportDetail, appUrl: string): string {
  const r = d.report;
  const out: string[] = [];

  out.push(`# #${r.number} ${r.title}`);
  const facts = [
    `**${r.status}**`,
    `${r.priority} priority`,
    `project ${r.project?.name ?? r.projectId}`,
    `reported ${ago(r.createdAt)} via ${r.source}`,
    r.environment ? `environment ${r.environment}` : "",
    r.release ? `release ${r.release}` : "",
    r.country ? `from ${r.country}` : "",
  ].filter(Boolean);
  out.push(facts.join(" · "));
  out.push(`${appUrl}/inbox/${r.id}`);

  if (r.reporterEmail || r.reporterName) {
    out.push(`\n**Reporter:** ${[r.reporterName, r.reporterEmail].filter(Boolean).join(" ")}${r.notifyReporter ? " (wants to hear when it's fixed)" : ""}`);
  }
  if (r.pageUrl) out.push(`**Page:** ${r.pageUrl}`);

  const ctx = r.context ?? {};
  const where = [r.browser, ctx.os, ctx.device, ctx.viewport && `viewport ${ctx.viewport}`, ctx.language, ctx.timezone].filter(Boolean);
  if (where.length) out.push(`**Where:** ${where.join(" · ")}`);
  if (ctx.referrer) out.push(`**Came from:** ${ctx.referrer}`);

  if (r.description) out.push(`\n## What they said\n\n${r.description}`);

  const meta = r.metadata && Object.keys(r.metadata).length ? r.metadata : null;
  if (meta) out.push(`\n## Attached by your app\n\n${fence(JSON.stringify(meta, null, 2), "json")}`);

  const diag = r.diagnostics ?? {};
  if (diag.console?.length) {
    out.push(`\n## Console, in the moments before it was sent`);
    out.push(
      diag.console
        .slice(-20)
        .map((e: any) => {
          // `original` is the stack put back through the release's source
          // maps: a file and a line someone can actually open.
          const stack = e.original ?? e.stack;
          const note = e.original ? `\n    ${"(mapped from the built file through this release's source maps)"}` : "";
          return `- **${e.level}** ${when(e.t)}: ${e.message}${stack ? `\n${indent(stack)}${note}` : ""}`;
        })
        .join("\n"),
    );
  }
  if (diag.network?.length) {
    out.push(`\n## Requests the page made`);
    out.push(
      diag.network
        .slice(-20)
        .map((n: any) => `- ${when(n.t)} \`${n.method} ${n.url}\` → ${n.error ? `failed (${n.error})` : `${n.status ?? "?"} in ${Math.round(n.ms)}ms`}`)
        .join("\n"),
    );
  }
  if (diag.steps?.length) {
    out.push(`\n## What they did`);
    out.push(diag.steps.slice(-20).map((s: any) => `- ${when(s.t)} ${s.kind}: ${s.label}`).join("\n"));
  }

  if (d.attachments?.length) {
    out.push(`\n## Attachments`);
    out.push(d.attachments.map((a) => `- ${a.filename} (${a.contentType}, ${bytes(a.sizeBytes)}) — ${appUrl}/api/orgs/current/attachments/${a.id}`).join("\n"));
  }

  if (d.duplicates?.length) {
    out.push(`\n## Reported ${d.duplicates.length + 1} times`);
    out.push(`Last seen ${ago(r.lastSeenAt ?? r.createdAt)}. Others: ${d.duplicates.slice(0, 10).map((x) => `#${x.number}`).join(", ")}${d.duplicates.length > 10 ? "…" : ""}`);
  }
  if (d.group) out.push(`\n> This is a duplicate of #${d.group.number} (${d.group.title}). Work on that one.`);

  if (d.deliveries?.length) {
    out.push(`\n## Delivered to`);
    out.push(
      d.deliveries
        .map((x) => {
          const state = x.status === "delivered" ? (x.externalState ? `${x.externalState} there` : "delivered") : x.status;
          const link = x.externalUrl ? ` — ${x.externalUrl}` : "";
          const why = x.lastError ? ` — ${x.lastError}` : "";
          return `- ${x.destinationName} (${x.provider}): ${state}${link}${why}`;
        })
        .join("\n"),
    );
  } else {
    out.push(`\n_No destination has this report yet._`);
  }

  return out.join("\n");
}

const when = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}s before` : `${t}ms before`);
const indent = (text: string) => text.split("\n").slice(0, 6).map((l) => `    ${l}`).join("\n");
export const fence = (text: string, lang = "") => `\`\`\`${lang}\n${text}\n\`\`\``;

/* ---------------------------------------------------------------- the rest */

export function destinationTable(destinations: Array<Record<string, any>>): string {
  if (!destinations.length) return "No destinations. Reports are stored but nobody is told about them.";
  const rows = destinations.map((d) => {
    const s = d.stats ?? {};
    const health = !d.enabled ? (d.pausedReason ? `paused (${d.pausedReason})` : "off") : s.weekFailed ? `${s.weekFailed} failed this week` : "ok";
    return `| ${d.name} | \`${d.id}\` | ${d.provider} | ${d.projectName ?? ""} | ${(d.events ?? []).join(", ")} | ${health} | ${s.delivered ?? 0} |`;
  });
  return ["| Destination | id | Service | Project | Events | Health | Delivered |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
}

export function deliveryTable(deliveries: Array<Record<string, any>>): string {
  if (!deliveries.length) return "No deliveries match.";
  const rows = deliveries.map(
    (d) =>
      `| ${d.id} | ${d.destinationName} (${d.provider}) | ${d.status}${d.attempts > 1 ? ` after ${d.attempts}` : ""} | ${d.reportTitle ? d.reportTitle.slice(0, 40) : d.isTest ? "test" : "—"} | ${ago(d.createdAt)} | ${(d.lastError ?? "").slice(0, 60)} |`,
  );
  return ["| Delivery | Destination | Status | Report | When | Error |", "| --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
}

export function analyticsSummary(a: Record<string, any>): string {
  const t = a.totals ?? {};
  const change = t.previousReports ? Math.round(((t.reports - t.previousReports) / t.previousReports) * 100) : null;
  const top = (list: Array<{ key: string; n: number }> | undefined, n = 5) => (list ?? []).slice(0, n).map((x) => `${x.key} (${x.n})`).join(", ") || "—";
  return [
    `**${t.reports} reports** over the last ${a.range}${change === null ? "" : `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on the period before`}.`,
    `${t.open} still open · ${t.resolved} resolved · ${t.reporters} people reported them.`,
    `Delivery: ${t.delivered} delivered, ${t.failed} failed, ${t.waiting} waiting${t.p95DeliveryMs ? `, 95th percentile ${t.p95DeliveryMs}ms` : ""}${t.failingDestinations ? ` · ${t.failingDestinations} destinations are failing` : ""}.`,
    "",
    `**Pages:** ${top(a.breakdowns?.page)}`,
    `**Browsers:** ${top(a.breakdowns?.browser)}`,
    `**Environments:** ${top(a.breakdowns?.environment)}`,
    `**Priority:** ${top(a.breakdowns?.priority)}`,
  ].join("\n");
}
