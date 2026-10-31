import { client, defaultProject } from "../context";
import { ago, done, say, style, table } from "../out";
import { flag, value, type Args } from "../args";

/** Why a report never reached the tracker, and making it try again. */

export async function deliveries(args: Args) {
  const { api } = client();
  const params = new URLSearchParams({ limit: value(args, "limit") ?? "25" });
  const project = defaultProject(value(args, "project"));
  if (project) params.set("project", (await api.project(project)).id);
  if (flag(args, "failed")) params.set("status", "failed");
  for (const key of ["status", "destination", "provider", "q"] as const) {
    const given = value(args, key);
    if (given) params.set(key, given);
  }

  const { deliveries: rows } = await api.get<{ deliveries: Array<Record<string, any>> }>(`/deliveries?${params}`);
  if (!rows.length) return say(style.grey("No deliveries match."));
  table(
    ["DELIVERY", "DESTINATION", "STATUS", "REPORT", "WHEN", "ERROR"],
    rows.map((d) => [
      style.grey(d.id),
      `${d.destinationName} ${style.grey(`(${d.provider})`)}`,
      d.status === "delivered" ? style.green(d.status) : d.status === "failed" ? style.red(d.status) : style.yellow(d.status),
      d.reportTitle ? String(d.reportTitle).slice(0, 34) : d.isTest ? style.grey("test") : "—",
      ago(d.createdAt),
      style.grey(String(d.lastError ?? "").slice(0, 44)),
    ]),
  );
}

export async function retry(args: Args) {
  const { api } = client();
  const one = args.command[1];
  if (one && one !== "--failed") {
    await api.call("POST", `/deliveries/${one}/retry`, {});
    done(`Queued ${one} for another attempt.`);
    return;
  }
  const project = defaultProject(value(args, "project"));
  const res = await api.call<{ queued: number }>("POST", "/deliveries/retry-failed", {
    project: project ? (await api.project(project)).id : undefined,
    destination: value(args, "destination"),
    provider: value(args, "provider"),
  });
  done(res.queued ? `Queued ${res.queued} failed deliver${res.queued === 1 ? "y" : "ies"}.` : "Nothing was waiting to be retried.");
}

export async function health(args: Args) {
  const { api } = client();
  void args;
  const h = await api.get<{
    status: string;
    problems: string[];
    deliveries: Record<string, number | null>;
    destinations: Record<string, number>;
    emails: Record<string, number>;
    reports: Record<string, number>;
  }>("/health");
  const mark = h.status === "ok" ? style.green("ok") : h.status === "behind" ? style.red("behind") : style.yellow("degraded");
  say(`${style.bold("status")}  ${mark}`);
  for (const problem of h.problems) say(`  ${style.red("✗")} ${problem}`);
  say("");
  say(`${style.grey("deliveries")}    ${h.deliveries.pending} waiting · ${h.deliveries.retrying} retrying · ${h.deliveries.failedLastDay} failed today · ${h.deliveries.deliveredLastDay} delivered today`);
  if (h.deliveries.oldestWaitingSeconds) say(`${style.grey("oldest wait")}   ${Math.round((h.deliveries.oldestWaitingSeconds as number) / 60)} minutes`);
  say(`${style.grey("destinations")}  ${h.destinations.enabled} enabled · ${h.destinations.paused} paused`);
  say(`${style.grey("emails")}        ${h.emails.pending} waiting · ${h.emails.failedLastDay} failed today`);
  say(`${style.grey("reports")}       ${h.reports.lastDay} today`);
  if (h.status !== "ok") process.exitCode = 1;
}
