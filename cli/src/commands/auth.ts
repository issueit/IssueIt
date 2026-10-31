import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { client, forgetCredentials, HOSTED, readCredentials, saveCredentials } from "../context";
import { done, fail, say, style, blank } from "../out";
import type { Args } from "../args";

/** Scopes the command line asks for: everything it has a command for, and nothing else. */
const CLI_SCOPES = [
  "reports:read",
  "reports:write",
  "projects:read",
  "projects:write",
  "destinations:read",
  "destinations:write",
  "connections:read",
  "deliveries:read",
  "deliveries:write",
  "analytics:read",
  "keys:write",
  "org:read",
];

type Start = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number };
type Poll = { token?: string; organisation?: { id: string; name: string } | null; error?: string; message?: string; interval?: number };

/**
 * Signs in without a secret ever touching the terminal: we show a code, a
 * person approves it in the dashboard, and the token arrives on the next
 * poll.
 */
export async function login(args: Args) {
  const url = String(args.flags.url ?? process.env.ISSUEIT_URL ?? HOSTED).replace(/\/+$/, "");
  const name = String(args.flags.name ?? `issueit CLI on ${hostname()}`);

  const started = await fetch(`${url}/api/auth/device`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, scopes: CLI_SCOPES }),
  });
  if (!started.ok) {
    fail(`Couldn't start signing in at ${url} (${started.status}). Is that the right address?`);
    process.exitCode = 1;
    return;
  }
  const start = (await started.json()) as Start;

  blank();
  say(`  Open ${style.bold(start.verification_uri)}`);
  say(`  and enter the code ${style.bold(start.user_code)}`);
  blank();
  say(style.grey(`  Or go straight there: ${start.verification_uri_complete}`));
  blank();
  say(style.grey("  Waiting…"));

  const deadline = Date.now() + start.expires_in * 1000;
  let interval = Math.max(start.interval, 2) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const res = await fetch(`${url}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: start.device_code }),
    });
    const body = (await res.json().catch(() => ({}))) as Poll;
    if (body.token) {
      saveCredentials({ url, token: body.token, organisation: body.organisation ?? null });
      blank();
      done(`Signed in to ${style.bold(body.organisation?.name ?? url)}.`);
      say(style.grey("  The token lasts 90 days. Revoke it any time in Settings › Account tokens."));
      return;
    }
    if (body.error === "slow_down") interval += 2000;
    else if (body.error && body.error !== "authorization_pending") {
      blank();
      fail(body.message ?? body.error);
      process.exitCode = 1;
      return;
    }
  }
  blank();
  fail("That took too long. Run `issueit login` again.");
  process.exitCode = 1;
}

export async function logout() {
  if (process.env.ISSUEIT_TOKEN) {
    fail("ISSUEIT_TOKEN is set in this shell, so there is nothing saved to forget. Unset it instead.");
    process.exitCode = 1;
    return;
  }
  done(forgetCredentials() ? "Forgotten. The token still exists; revoke it in Settings › Account tokens." : "Nothing was saved.");
}

export async function whoami() {
  const saved = readCredentials();
  if (!saved) {
    fail("Not signed in. Run `issueit login`.");
    process.exitCode = 1;
    return;
  }
  const { api } = client();
  const me = await api.whoami(true);
  say(`${style.bold(me.user.name)} <${me.user.email}>`);
  say(`${style.grey("organisation")}  ${me.organisation.name} (${me.organisation.id}) as ${me.organisation.role}`);
  say(`${style.grey("issueit")}       ${saved.url}`);
  say(`${style.grey("scopes")}        ${me.auth.scopes === "all" ? "everything" : me.auth.scopes.join(", ")}`);
  say(`${style.grey("projects")}      ${me.projects.map((p) => `${p.name} (${p.id})`).join(", ") || "none yet"}`);
  if (process.env.ISSUEIT_TOKEN) say(style.grey("using ISSUEIT_TOKEN from the environment"));
}

const hostname = () => os.hostname().split(".")[0] || "this machine";
