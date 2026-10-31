import { client, defaultProject } from "../context";
import { renderReport, type ReportDetail, type ReportListItem } from "../../../mcp/src/render";
import { ago, blank, done, fail, priorityColour, say, statusColour, style, table } from "../out";
import { flag, value, type Args } from "../args";

/** Reading and changing bug reports, which is most of what anyone does. */

export async function list(args: Args) {
  const { api } = client();
  const params = new URLSearchParams({ status: value(args, "status") ?? "open", limit: value(args, "limit") ?? "20" });
  const project = defaultProject(value(args, "project"));
  if (project) params.set("project", (await api.project(project)).id);
  for (const key of ["priority", "q", "since"] as const) {
    const given = value(args, key);
    if (given) params.set(key, given);
  }
  if (flag(args, "failing")) params.set("delivery", "failed");

  const { reports } = await api.get<{ reports: ReportListItem[] }>(`/reports?${params}`);
  if (!reports.length) return say(style.grey("No reports match."));
  table(
    ["REPORT", "TITLE", "STATUS", "PRIORITY", "SEEN", ""],
    reports.map((r) => [
      style.bold(`#${r.number}`),
      r.title.length > 54 ? `${r.title.slice(0, 53)}…` : r.title,
      statusColour(r.status),
      priorityColour(r.priority),
      ago(r.createdAt),
      [r.duplicateCount ? `×${r.duplicateCount + 1}` : "", r.failed ? style.red(`${r.failed} failed`) : ""].filter(Boolean).join(" "),
    ]),
  );
  if (!project) say(style.grey("\nAcross every project. Narrow with --project."));
}

export async function show(args: Args) {
  const reference = args.command[1];
  if (!reference) return usage("issueit show <report>");
  const { api, url } = client();
  const id = await api.reportId(reference, defaultProject(value(args, "project")));
  const detail = await api.get<ReportDetail>(`/reports/${id}`);
  say(renderReport(detail, url));
}

export async function resolve(args: Args) {
  const reference = args.command[1];
  if (!reference) return usage("issueit resolve <report>");
  const { api } = client();
  const id = await api.reportId(reference, defaultProject(value(args, "project")));
  const res = await api.call<{ report: { number: number; duplicateCount: number } }>("PATCH", `/reports/${id}`, { status: "resolved" });
  const n = res.report.duplicateCount;
  done(`#${res.report.number} resolved${n ? `, with the ${n} duplicate${n === 1 ? "" : "s"} grouped with it` : ""}.`);
}

/** Files a bug from wherever you are: a failing test, a git hook, a terminal. */
export async function file(args: Args) {
  const title = args.command.slice(1).join(" ").trim();
  if (!title) return usage('issueit file "Login button does nothing"');
  const project = defaultProject(value(args, "project"));
  if (!project) {
    fail("Which project? Pass --project, or run `issueit init` here first.");
    process.exitCode = 1;
    return;
  }
  const { api, url } = client();
  const found = await api.project(project);
  const description = value(args, "description") ?? (await readStdin());
  const res = await api.submit(
    found.id,
    {
      title,
      description: description || undefined,
      priority: value(args, "priority"),
      environment: value(args, "environment"),
      release: value(args, "release"),
      fingerprint: value(args, "fingerprint"),
      source: "cli",
    },
    value(args, "key") ?? process.env.ISSUEIT_INGEST_KEY,
  );
  done(`Filed in ${found.name}: ${url}/inbox/${(res as { report_id: string }).report_id}`);
}

export async function open(args: Args) {
  const reference = args.command[1];
  const { api, url } = client();
  const target = reference ? `${url}/inbox/${await api.reportId(reference, defaultProject(value(args, "project")))}` : `${url}/inbox`;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const { spawn } = await import("node:child_process");
  spawn(opener, [target], { stdio: "ignore", detached: true }).unref();
  say(style.grey(target));
}

/** A description piped in, so `git log -1 | issueit file "…"` works. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function usage(line: string) {
  blank();
  fail(`Usage: ${line}`);
  process.exitCode = 1;
}
