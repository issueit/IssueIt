import { createHmac } from "node:crypto";
import { client, defaultProject } from "../context";
import { blank, fail, priorityColour, say, style } from "../out";
import { value, type Args } from "../args";

/**
 * Watching a live install: reports as they arrive, and webhook events
 * forwarded to something running on your own machine, so a webhook
 * destination can be built without a tunnel.
 */

type Event =
  | { type: "report.created" | "report.updated" | "report.deleted"; orgId: string; projectId: string; reportId: string }
  | { type: "delivery.updated"; orgId: string; projectId: string; reportId: string | null; deliveryId: string }
  | { type: "delivery.queued" | "email.queued"; orgId: string };

/**
 * Reads the organisation's event stream. Reconnects on its own, because a
 * terminal left open overnight will outlive any single connection.
 */
async function stream(onEvent: (event: Event) => Promise<void> | void) {
  const { api } = client();
  let backoff = 1000;

  for (;;) {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    try {
      const res = await api.openStream("/events", controller.signal);
      if (res.status === 401 || res.status === 403) {
        fail(`${res.status === 401 ? "That token isn't valid." : "That token can't read reports."} Run \`issueit login\`.`);
        process.exitCode = 1;
        return;
      }
      if (!res.ok || !res.body) throw new Error(`stream closed with ${res.status}`);
      backoff = 1000;

      let buffer = "";
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += Buffer.from(chunk).toString("utf8");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = block
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (!data || data === "{}") continue;
          try {
            await onEvent(JSON.parse(data) as Event);
          } catch {
            // One malformed event shouldn't end the watch.
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      say(style.grey(`  reconnecting in ${Math.round(backoff / 1000)}s (${(err as Error).message})`));
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    } finally {
      process.off("SIGINT", stop);
    }
  }
}

/** Reports as they arrive, one line each. */
export async function tail(args: Args) {
  const { api, url } = client();
  const wanted = defaultProject(value(args, "project"));
  const only = wanted ? (await api.project(wanted)).id : null;

  blank();
  say(style.grey(`  Watching ${only ? wanted : "every project"} at ${url}. Ctrl-C to stop.`));
  blank();

  await stream(async (event) => {
    if (event.type !== "report.created" && event.type !== "report.updated") return;
    if (only && event.projectId !== only) return;
    try {
      const { report } = await api.get<{ report: { number: number; title: string; priority: string; status: string; pageUrl: string | null; project: { name: string } } }>(
        `/reports/${event.reportId}`,
      );
      const when = new Date().toTimeString().slice(0, 8);
      const mark = event.type === "report.created" ? style.green("new") : style.grey("upd");
      say(`${style.grey(when)} ${mark} ${style.bold(`#${report.number}`)} ${report.title}`);
      say(`${" ".repeat(13)}${style.grey(`${report.project.name} · ${priorityColour(report.priority)} · ${report.pageUrl ?? "no page"}`)}`);
    } catch {
      // Deleted between the event and the read; nothing to show.
    }
  });
}

/**
 * Forwards report events to a URL on this machine, signed the same way a
 * real webhook destination is, so you can build and test a receiver without
 * deploying it or opening a tunnel.
 */
export async function listen(args: Args) {
  const target = value(args, "forward");
  if (!target) {
    fail("Where to? `issueit listen --forward http://localhost:3000/hooks`");
    process.exitCode = 1;
    return;
  }
  const secret = value(args, "secret") ?? "whsec_local";
  const { api } = client();
  const wanted = defaultProject(value(args, "project"));
  const only = wanted ? (await api.project(wanted)).id : null;

  blank();
  say(style.grey(`  Forwarding ${only ? wanted : "every project"}'s reports to ${style.bold(target)}`));
  say(style.grey(`  Signed with ${secret} — verify it exactly as you would a real webhook.`));
  blank();

  await stream(async (event) => {
    if (event.type !== "report.created") return;
    if (only && event.projectId !== only) return;
    let report: Record<string, unknown>;
    try {
      ({ report } = await api.get<{ report: Record<string, unknown> }>(`/reports/${event.reportId}`));
    } catch {
      return;
    }
    const body = JSON.stringify({ id: `evt_local_${event.reportId}`, event: "report.created", created_at: new Date().toISOString(), data: { report } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const started = Date.now();
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", "issueit-signature": `t=${timestamp},v1=${signature}`, "issueit-event": "report.created", "issueit-delivery": "local" },
        body,
      });
      const ms = Date.now() - started;
      const mark = res.ok ? style.green(String(res.status)) : style.red(String(res.status));
      say(`${style.grey(new Date().toTimeString().slice(0, 8))} ${mark} report.created → ${target} ${style.grey(`${ms}ms`)}`);
      if (!res.ok) say(style.grey(`           ${(await res.text()).slice(0, 200)}`));
    } catch (err) {
      say(`${style.grey(new Date().toTimeString().slice(0, 8))} ${style.red("err")} ${(err as Error).message}`);
    }
  });
}
