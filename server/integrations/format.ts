import type { Priority } from "../db/schema";
import type { ReportPayload } from "./types";

/** Shared wording for reports sent to other tools, so every destination reads the same. */

export const priorityLabel: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function environmentLine(r: ReportPayload): string | null {
  const parts = [r.browser ?? r.context.browser, r.context.os, r.context.device, r.context.viewport && `viewport ${r.context.viewport}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Facts as label/value pairs, skipping empty ones. */
export function facts(r: ReportPayload): Array<[string, string]> {
  const rows: Array<[string, string | null | undefined]> = [
    ["Priority", priorityLabel[r.priority]],
    ["Project", r.project.name],
    ["Source", r.source],
    ["Environment", r.environment],
    ["Page", r.pageUrl],
    ["Browser", environmentLine(r)],
    ["Reporter", [r.reporter.name, r.reporter.email].filter(Boolean).join(" · ") || null],
  ];
  return rows.filter((row): row is [string, string] => !!row[1]);
}

const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** "4.2s before" for a diagnostics entry. */
export const before = (ms: number) => (ms < 1000 ? "just before" : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s before` : `${Math.round(ms / 60_000)}m before`);

/** The captured console, requests and steps as plain lines, newest last. Failed requests only. */
export function diagnosticsLines(r: ReportPayload) {
  const d = r.diagnostics ?? {};
  const consoleLines = (d.console ?? [])
    .filter((e) => e.level === "error" || e.level === "warn")
    .slice(-15)
    .map((e) => `[${e.level}] ${e.message}${e.stack ? `\n    ${e.stack.split("\n").slice(0, 3).join("\n    ")}` : ""}`);
  const failed = (d.network ?? []).filter((n) => n.status === null || n.status >= 400).slice(-15).map((n) => `${n.method} ${n.url} → ${n.status ?? n.error ?? "failed"} (${n.ms} ms)`);
  const steps = (d.steps ?? []).slice(-15).map((s) => `${before(s.t)}: ${s.kind === "navigate" ? "went to" : s.kind === "input" ? "changed" : "clicked"} ${s.label}`);
  return { consoleLines, failed, steps };
}

/** GitHub/GitLab/Linear/ClickUp flavoured Markdown. */
export function markdownBody(r: ReportPayload): string {
  const out: string[] = [];
  out.push(r.description.trim() || "_No description provided._", "");
  out.push("| | |", "| --- | --- |");
  for (const [k, v] of facts(r)) out.push(`| ${k} | ${escapeCell(v)} |`);
  out.push("");
  if (r.attachments.length) {
    out.push("**Attachments**", "");
    for (const a of r.attachments) {
      const isImage = a.contentType.startsWith("image/");
      out.push(isImage ? `![${a.filename}](${a.url})` : `- [${a.filename}](${a.url}) (${formatBytes(a.sizeBytes)})`);
    }
    out.push("");
  }
  const { consoleLines, failed, steps } = diagnosticsLines(r);
  const fence = (title: string, lines: string[]) => {
    if (lines.length) out.push(`<details><summary>${title}</summary>`, "", "```", lines.join("\n").replace(/```/g, "` ` `").slice(0, 6000), "```", "", "</details>", "");
  };
  fence(`Console (${consoleLines.length})`, consoleLines);
  fence(`Failed requests (${failed.length})`, failed);
  fence(`Steps before reporting (${steps.length})`, steps);
  const meta = Object.keys(r.metadata).length ? JSON.stringify(r.metadata, null, 2) : null;
  if (meta) out.push("<details><summary>Metadata</summary>", "", "```json", meta.slice(0, 6000), "```", "", "</details>", "");
  out.push(`Reported through [Issueit](${r.dashboardUrl}) · ${r.id}`);
  return out.join("\n");
}

/** Markdown without HTML, for tools that don't render it (Linear, ClickUp, Trello). */
export function plainMarkdownBody(r: ReportPayload): string {
  return markdownBody(r)
    .replace(/<details><summary>([^<]+)<\/summary>\n\n/g, "**$1**\n\n")
    .replace(/\n\n<\/details>/g, "");
}

/** The comment a tracker gets when the same bug is reported again. */
export function duplicateComment(r: ReportPayload, count: number, groupUrl: string): string {
  const out = [`**Reported again** · ${count} reports so far`, "", `Latest: ${r.title}`, ""];
  for (const [k, v] of facts(r)) if (["Page", "Browser", "Environment", "Reporter"].includes(k)) out.push(`- ${k}: ${v}`);
  const firstError = diagnosticsLines(r).consoleLines.find((l) => l.startsWith("[error]"));
  if (firstError) out.push(`- Console: ${firstError.split("\n")[0].replace(/^\[error\] /, "").slice(0, 300)}`);
  out.push("", `[See all ${count} in Issueit](${groupUrl})`);
  return out.join("\n");
}

export const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export const issueTitle = (r: ReportPayload) => truncate(r.title, 240);

/** "[Test] " in front of test deliveries, so nobody mistakes one for a real report. */
export const titleFor = (r: ReportPayload, isTest: boolean) => (isTest ? "[Test] " : "") + issueTitle(r);

/** Plain text for SMS, push and chat services without formatting. */
export function plainBody(r: ReportPayload, max = 4000): string {
  const out = [r.description.trim() || "No description provided.", ""];
  for (const [k, v] of facts(r)) out.push(`${k}: ${v}`);
  if (r.attachments.length) out.push("", `Attachments: ${r.attachments.map((a) => a.url).join(" ")}`);
  out.push("", `View in Issueit: ${r.dashboardUrl}`);
  return truncate(out.join("\n"), max);
}

/** A short line for SMS and push notifications. */
export const shortLine = (r: ReportPayload, isTest: boolean) => `${priorityLabel[r.priority]} · ${titleFor(r, isTest)}`;

export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** HTML for help desks, email and trackers that store rich text. */
export function htmlBody(r: ReportPayload): string {
  const out: string[] = [];
  const description = r.description.trim();
  out.push(description ? description.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") : "<p><em>No description provided.</em></p>");
  out.push("<table>", ...facts(r).map(([k, v]) => `<tr><th align="left">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`), "</table>");
  if (r.attachments.length) {
    out.push("<p><strong>Attachments</strong></p><ul>");
    for (const a of r.attachments) out.push(`<li><a href="${escapeHtml(a.url)}">${escapeHtml(a.filename)}</a> (${formatBytes(a.sizeBytes)})</li>`);
    out.push("</ul>");
  }
  const { consoleLines, failed } = diagnosticsLines(r);
  for (const [title, lines] of [["Console", consoleLines], ["Failed requests", failed]] as const)
    if (lines.length) out.push(`<p><strong>${title}</strong></p><pre>${escapeHtml(lines.join("\n").slice(0, 4000))}</pre>`);
  out.push(`<p>Reported through <a href="${escapeHtml(r.dashboardUrl)}">Issueit</a> · ${escapeHtml(r.id)}</p>`);
  return out.join("");
}

/** Every service's priority scale, mapped from Issueit's four levels. */
export const priorityScale = {
  /** Highest first, 1-4 (Freshdesk, Zendesk-like scales reversed below). */
  oneToFourHigh: { critical: 4, high: 3, medium: 2, low: 1 },
  oneToFourLow: { critical: 1, high: 2, medium: 3, low: 4 },
  words: { critical: "urgent", high: "high", medium: "normal", low: "low" },
  severity: { critical: "critical", high: "error", medium: "warning", low: "info" },
} as const;
