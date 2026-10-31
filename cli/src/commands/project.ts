import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { client, defaultProject, findProjectFile, writeProjectFile } from "../context";
import { installSnippet } from "../../../mcp/src/snippets";
import { bytes, blank, done, fail, say, style, warn } from "../out";
import { flag, value, type Args } from "../args";

/**
 * Setting a project up, keeping its settings in the repository, and giving
 * a build's source maps to Issueit so stacks stop being unreadable.
 */

const FRAMEWORKS = ["html", "react", "next", "vue", "svelte", "node", "curl"] as const;

/** Creates the project if it isn't there, writes `.issueit.json`, prints the snippet. */
export async function init(args: Args) {
  const { api, url } = client();
  const name = value(args, "name") ?? path.basename(process.cwd());
  const framework = guessFramework(value(args, "framework"));

  const me = await api.whoami(true);
  let project = me.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (project) warn(`A project called "${project.name}" already exists here, so nothing was created.`);
  else {
    const made = await api.call<{ project: { id: string; name: string } }>("POST", "/projects", { name });
    project = made.project;
    done(`Created ${style.bold(project.name)}.`);
  }

  const detail = await api.get<{ links: Record<string, string> }>(`/projects/${project.id}`);
  const written = writeProjectFile({ project: project.id, url });
  say(style.grey(`  Wrote ${path.relative(process.cwd(), written)}`));
  blank();
  say(`  ${style.grey("project id")}  ${project.id}`);
  say(`  ${style.grey("endpoint")}    ${detail.links.endpoint}`);
  say(`  ${style.grey("hosted form")} ${detail.links.formUrl}`);
  blank();
  say(style.bold(`  Add this to your app (${framework}):`));
  blank();
  say(
    installSnippet(framework, project.id, detail.links)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );
  blank();
  say(style.grey("  Then: issueit tail — to watch the first report arrive."));
}

/** Looks at what's in the directory rather than asking. */
function guessFramework(given?: string): string {
  if (given && (FRAMEWORKS as readonly string[]).includes(given)) return given;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) return "next";
    if (deps.svelte || deps["@sveltejs/kit"]) return "svelte";
    if (deps.vue || deps.nuxt) return "vue";
    if (deps.react) return "react";
  } catch {
    // No package.json, or not readable: the plain snippet suits anything.
  }
  return "html";
}

/* --------------------------------------------------------- config as code */

const CONFIG_FILE = "issueit.config.json";

/** Writes the project's settings to a file you can commit. */
export async function pull(args: Args) {
  const { api } = client();
  const project = await resolve(api, args);
  const target = args.command[1] ?? CONFIG_FILE;
  const { config } = await api.get<{ config: Record<string, unknown> }>(`/projects/${project}/config${flag(args, "secrets") ? "?secrets=1" : ""}`);
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  done(`Wrote ${target}.`);
  if (!flag(args, "secrets")) say(style.grey("  Webhook URLs were left out. Pass --secrets to include them."));
}

/** Applies a file back. Shows the difference first unless told to just do it. */
export async function push(args: Args) {
  const { api } = client();
  const project = await resolve(api, args);
  const source = args.command[1] ?? CONFIG_FILE;
  if (!fs.existsSync(source)) {
    fail(`${source} isn't here. Run \`issueit pull\` first.`);
    process.exitCode = 1;
    return;
  }
  let config: unknown;
  try {
    config = JSON.parse(fs.readFileSync(source, "utf8"));
  } catch (err) {
    fail(`${source} isn't valid JSON: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const prune = flag(args, "prune");
  const plan = await api.call<{ changes: string[]; problems: string[]; wouldRemove: string[] }>("POST", `/projects/${project}/config`, { config, dryRun: true, prune });

  if (plan.problems.length) {
    for (const problem of plan.problems) fail(problem);
    blank();
  }
  if (!plan.changes.length) {
    done("Already up to date.");
    return;
  }
  say(style.bold(flag(args, "dryRun") ? "Would change:" : "Changing:"));
  for (const change of plan.changes) say(`  ${style.grey("·")} ${change}`);
  blank();

  if (flag(args, "dryRun")) {
    if (plan.problems.length) process.exitCode = 1;
    return;
  }
  if (plan.problems.length) {
    fail("Fix the problems above first; nothing was changed.");
    process.exitCode = 1;
    return;
  }
  const applied = await api.call<{ changes: string[]; removed: string[] }>("POST", `/projects/${project}/config`, { config, dryRun: false, prune });
  done(`Applied ${applied.changes.length} change${applied.changes.length === 1 ? "" : "s"}.`);
  if (applied.removed.length) say(style.grey(`  Removed: ${applied.removed.join(", ")}`));
}

/* ------------------------------------------------------------ source maps */

/**
 * Uploads every .map in a build directory, named after the file it belongs
 * to, so a minified stack in a report turns back into your source.
 */
export async function sourcemaps(args: Args) {
  if (args.command[1] !== "upload") {
    fail("Usage: issueit sourcemaps upload <directory> --release <version>");
    process.exitCode = 1;
    return;
  }
  const dir = args.command[2] ?? "dist";
  const release = value(args, "release") ?? gitDescribe();
  if (!release) {
    fail("Which build? Pass --release, or run this where git can name a commit.");
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(dir)) {
    fail(`${dir} isn't here.`);
    process.exitCode = 1;
    return;
  }

  const { api } = client();
  const project = await resolve(api, args);
  /** The prefix the browser sees, e.g. assets/app.js rather than dist/assets/app.js. */
  const prefix = (value(args, "prefix") ?? "").replace(/^\/+|\/+$/g, "");

  const made = await api.call<{ release: { id: string; version: string } }>("POST", `/projects/${project}/releases`, {
    version: release,
    dist: value(args, "dist") ?? null,
    commit: value(args, "commit") ?? gitCommit(),
    url: value(args, "url") ?? null,
  });

  const maps = walk(dir).filter((f) => f.endsWith(".map"));
  if (!maps.length) {
    warn(`No .map files under ${dir}. Is the build made with source maps on?`);
    return;
  }

  let uploaded = 0;
  let failed = 0;
  for (const map of maps) {
    const relative = path.relative(dir, map).split(path.sep).join("/");
    // app.js.map belongs to app.js.
    const file = [prefix, relative.replace(/\.map$/, "")].filter(Boolean).join("/");
    const body = fs.readFileSync(map, "utf8");
    try {
      await api.putText(`/projects/${project}/releases/${made.release.id}/sourcemaps?file=${encodeURIComponent(file)}`, body);
      say(`  ${style.green("↑")} ${file} ${style.grey(bytes(body.length))}`);
      uploaded++;
    } catch (err) {
      say(`  ${style.red("✗")} ${file} ${style.grey((err as Error).message)}`);
      failed++;
    }
  }
  blank();
  done(`${uploaded} map${uploaded === 1 ? "" : "s"} uploaded for ${style.bold(made.release.version)}${failed ? `, ${failed} failed` : ""}.`);
  say(style.grey(`  Send "release": "${made.release.version}" with your reports and stacks will be mapped back.`));
  if (failed) process.exitCode = 1;
}

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
};
const gitDescribe = () => git("describe", "--tags", "--always", "--dirty");
const gitCommit = () => git("rev-parse", "HEAD");

/* ---------------------------------------------------------------- doctor */

/** What's wrong with this install, in the order worth fixing. */
export async function doctor(args: Args) {
  const { api, url } = client();
  const found = findProjectFile();
  blank();
  say(style.bold("  Issueit"));
  say(`  ${style.grey("address")}  ${url}`);

  let me;
  try {
    me = await api.whoami(true);
    say(`  ${style.green("✓")} signed in as ${me.user.email} in ${me.organisation.name}`);
  } catch (err) {
    say(`  ${style.red("✗")} ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const project = defaultProject(value(args, "project"));
  if (!project) {
    blank();
    warn("No project here. Run `issueit init`, or pass --project.");
    return;
  }
  const resolved = await api.project(project);
  say(`  ${style.grey("project")}  ${resolved.name} (${resolved.id})${found ? style.grey(` from ${path.basename(found.path)}`) : ""}`);
  blank();

  const [detail, destinations, reports] = await Promise.all([
    api.get<{ project: Record<string, any>; stats: { total: number; open: number; week: number } }>(`/projects/${resolved.id}`),
    api.get<{ destinations: Array<Record<string, any>> }>(`/projects/${resolved.id}/destinations`),
    api.get<{ reports: Array<{ createdAt: string }> }>(`/reports?project=${resolved.id}&status=all&limit=1`),
  ]);
  const problems: string[] = [];
  const notes: string[] = [];
  if (!reports.reports.length) problems.push("No report has ever arrived. Is the widget installed and reaching the endpoint?");
  else notes.push(`${detail.stats.total} reports, ${detail.stats.open} open, ${detail.stats.week} this week.`);
  const live = destinations.destinations.filter((d) => d.enabled);
  if (!live.length) problems.push("No destination is enabled, so reports are stored but nobody is told.");
  for (const d of destinations.destinations.filter((d) => d.pausedReason)) problems.push(`Destination "${d.name}" is paused: ${d.pausedReason}.`);
  for (const d of live.filter((d) => (d.stats?.weekFailed ?? 0) > 0 && !(d.stats?.weekDelivered ?? 0))) {
    problems.push(`Destination "${d.name}" has failed every delivery this week: ${d.stats?.lastError ?? "no reason recorded"}.`);
  }
  if (!detail.project.allowedOrigins?.length) notes.push("No allowed sites are set, so reports are accepted from anywhere.");
  if (!detail.project.widget?.captureConsole) notes.push("Console capture is off, so reports won't carry the errors that caused them.");
  if (!detail.project.emails?.enabled) notes.push("Reporters aren't emailed, so nobody hears back when their bug is fixed.");

  const health = await api.get<{ status: string; problems: string[] }>("/health").catch(() => null);
  for (const problem of problems) say(`  ${style.red("✗")} ${problem}`);
  for (const problem of health?.problems ?? []) say(`  ${style.red("✗")} ${problem}`);
  for (const note of notes) say(`  ${style.grey("·")} ${note}`);
  if (!problems.length && !(health?.problems.length ?? 0)) {
    blank();
    done("Nothing wrong that I can see.");
  } else {
    process.exitCode = 1;
  }
}

/* --------------------------------------------------------------- helpers */

async function resolve(api: ReturnType<typeof client>["api"], args: Args): Promise<string> {
  const given = defaultProject(value(args, "project"));
  if (!given) throw new Error("Which project? Pass --project, or run `issueit init` here first.");
  return (await api.project(given)).id;
}
