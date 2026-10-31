#!/usr/bin/env node
/**
 * Exports the self-hosted edition into its own directory, ready to push to
 * the public repository.
 *
 *   node scripts/publish-oss.mjs --out ../issueit-selfhost
 *   node scripts/publish-oss.mjs --out ../issueit-selfhost --verify
 *
 * One repository, one export. Maintaining two copies of the same server by
 * hand is how the open edition quietly rots, so this copies an allowlist of
 * paths and refuses to guess: a new top-level directory has to be listed
 * here or the export stops and says so.
 *
 * What's held back is the integration catalogue — the hundred-odd
 * token-based services — because that is the work the hosted service sells.
 * Everything else ships: intake, the outbox, the eleven hand-written
 * providers, source maps, tokens, the audit log, MCP, the CLI and the SDKs.
 * Plans and billing come along too and are inert, because EDITION defaults
 * to "selfhost": every feature on, limits from the operator's own .env.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Everything the self-hosted edition is made of. */
const INCLUDE = [
  "server",
  "web",
  "widget",
  "drizzle",
  "mcp",
  "cli",
  "sdk",
  "scripts/build-widget.mjs",
  "scripts/backup.sh",
  "scripts/restore.sh",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "drizzle.config.ts",
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  ".gitignore",
  ".env.example",
];

/** Things in those paths that stay behind. */
const EXCLUDE = [
  // The catalogue is the hosted service's own work.
  "server/integrations/catalogue/trackers.ts",
  "server/integrations/catalogue/helpdesk.ts",
  "server/integrations/catalogue/data.ts",
  "server/integrations/catalogue/chat.ts",
  "server/integrations/catalogue/ops.ts",
  // It asserts on every catalogue entry, so it goes with them.
  "server/integrations/catalogue/catalogue.test.ts",
  // Build output and anything secret, wherever it turns up.
  "node_modules",
  "dist",
  ".env",
  "backups",
  "data",
];

/**
 * The one generated file. `notify.ts` stays because reporter email is built
 * on its mailers, so the shim keeps the notifiers and drops the rest.
 */
const CATALOGUE_SHIM = `import type { Provider } from "../types";
import { notifiers } from "./notify";

/**
 * The self-hosted edition's catalogue: the push and alerting services, plus
 * the email services reporter mail is sent through. The hand-written
 * providers — GitHub, GitLab, Linear, Jira, ClickUp, Trello, Notion, Slack,
 * Discord, webhook, SMTP — are registered separately in ../index.ts.
 *
 * The hosted service at issueit.app carries a larger catalogue.
 */
export const catalogue: Provider[] = [...notifiers];
`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const out = path.resolve(root, value("out", "../issueit-selfhost"));
const verify = flag("verify");

if (out === root) {
  console.error("The output directory can't be the repository itself.");
  process.exit(1);
}

/** Nothing outside the allowlist gets through unnoticed. */
const unlisted = fs
  .readdirSync(root, { withFileTypes: true })
  .map((e) => e.name)
  .filter((name) => !name.startsWith(".") || [".gitignore", ".env.example", ".dockerignore"].includes(name))
  .filter((name) => !["node_modules", "dist", "backups", "data", "LICENSE", "README.md"].includes(name))
  .filter((name) => !INCLUDE.some((inc) => inc === name || inc.startsWith(`${name}/`)));

if (unlisted.length) {
  console.error(`These aren't listed in publish-oss.mjs, so the export stopped rather than guess:\n  ${unlisted.join("\n  ")}`);
  console.error("Add each to INCLUDE or EXCLUDE.");
  process.exit(1);
}

const excluded = (relative) => EXCLUDE.some((e) => relative === e || relative.startsWith(`${e}/`) || path.basename(relative) === e);

let files = 0;
function copy(from, to) {
  const relative = path.relative(root, from);
  if (excluded(relative)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copy(path.join(from, entry), path.join(to, entry));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  fs.chmodSync(to, stat.mode & 0o777);
  files += 1;
}

/* ------------------------------------------------------------------ export */

console.log(`Exporting the self-hosted edition to ${out}`);

// Keep the target's own .git, so this can be pushed as one commit per release.
if (fs.existsSync(out)) {
  for (const entry of fs.readdirSync(out)) {
    if (entry === ".git") continue;
    fs.rmSync(path.join(out, entry), { recursive: true, force: true });
  }
} else {
  fs.mkdirSync(out, { recursive: true });
}

for (const include of INCLUDE) {
  const from = path.join(root, include);
  if (!fs.existsSync(from)) {
    console.error(`Missing: ${include}`);
    process.exit(1);
  }
  copy(from, path.join(out, include));
}

fs.writeFileSync(path.join(out, "server/integrations/catalogue/index.ts"), CATALOGUE_SHIM);
fs.copyFileSync(path.join(root, "scripts/oss/LICENSE"), path.join(out, "LICENSE"));
fs.copyFileSync(path.join(root, "scripts/oss/README.md"), path.join(out, "README.md"));

// The client libraries stay MIT; the server is AGPL from here.
const pkg = JSON.parse(fs.readFileSync(path.join(out, "package.json"), "utf8"));
pkg.license = "AGPL-3.0-only";
pkg.description = "Issueit, self-hosted: capture a bug, deliver it to the developer, get out of the way.";
delete pkg.scripts["db:generate"];
fs.writeFileSync(path.join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`  ${files} files`);
console.log(`  ${EXCLUDE.filter((e) => e.startsWith("server/")).length} held back`);

/* ------------------------------------------------------------------ verify */

if (verify) {
  console.log("\nChecking the export builds and passes its tests on its own.");
  const run = (command, args) => execFileSync(command, args, { cwd: out, stdio: "inherit" });
  run("npm", ["ci", "--no-audit", "--no-fund"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"]);
  run("npm", ["run", "build"]);
  console.log("\nThe export is sound.");
}

console.log(`\nNext: cd ${path.relative(process.cwd(), out)} && git add -A && git commit -m "Issueit <version>" && git push`);
