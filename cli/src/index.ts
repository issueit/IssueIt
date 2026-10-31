#!/usr/bin/env node
import { parseArgs, flag, type Args } from "./args";
import { IssueitError, NotSignedIn } from "./context";
import { blank, fail, say, style } from "./out";
import { login, logout, whoami } from "./commands/auth";
import { file, list, open, resolve, show } from "./commands/reports";
import { listen, tail } from "./commands/watch";
import { doctor, init, pull, push, sourcemaps } from "./commands/project";
import { deliveries, health, retry } from "./commands/delivery";

const VERSION = "0.1.0";

type Command = { run: (args: Args) => Promise<void>; summary: string; usage?: string };

const commands: Record<string, Command> = {
  login: { run: login, summary: "Sign in from this terminal", usage: "issueit login [--url https://your-issueit]" },
  logout: { run: logout, summary: "Forget the saved token" },
  whoami: { run: whoami, summary: "Who this terminal is signed in as" },

  init: { run: init, summary: "Set this project up and print the snippet", usage: "issueit init [--name NAME] [--framework next]" },
  ls: { run: list, summary: "List bug reports", usage: "issueit ls [--status open] [--priority high] [--failing] [--q TEXT]" },
  show: { run: show, summary: "Read one report in full, with its diagnostics", usage: "issueit show <report>" },
  resolve: { run: resolve, summary: "Mark a bug fixed", usage: "issueit resolve <report>" },
  file: { run: file, summary: "File a bug from here", usage: 'issueit file "Login button does nothing" [--priority high]' },
  open: { run: open, summary: "Open a report in the browser", usage: "issueit open [report]" },

  tail: { run: tail, summary: "Watch reports arrive", usage: "issueit tail [--project NAME]" },
  listen: { run: listen, summary: "Forward reports to a URL on this machine", usage: "issueit listen --forward http://localhost:3000/hooks" },

  pull: { run: pull, summary: "Write the project's settings to a file", usage: "issueit pull [file] [--secrets]" },
  push: { run: push, summary: "Apply a settings file back", usage: "issueit push [file] [--dry-run] [--prune]" },
  sourcemaps: { run: sourcemaps, summary: "Upload a build's source maps", usage: "issueit sourcemaps upload <dir> --release 2.3.1" },

  deliveries: { run: deliveries, summary: "Read the delivery log", usage: "issueit deliveries [--failed]" },
  retry: { run: retry, summary: "Try failed deliveries again", usage: "issueit retry [delivery] [--project NAME]" },
  health: { run: health, summary: "Whether delivery is keeping up" },
  doctor: { run: doctor, summary: "Check this project is set up properly" },
};

const HELP = `${style.bold("issueit")} — capture a bug, deliver it to the developer, get out of the way.

${style.grey("Usage:")} issueit <command> [options]

${style.bold("Getting started")}
  login            Sign in from this terminal
  init             Set this project up and print the snippet
  doctor           Check this project is set up properly

${style.bold("Bugs")}
  ls               List bug reports
  show <report>    Read one in full, with the console errors and steps
  resolve <report> Mark a bug fixed
  file "<title>"   File a bug from here (a description can be piped in)
  open [report]    Open it in the browser

${style.bold("Watching")}
  tail             Watch reports arrive
  listen           Forward reports to a URL on this machine, signed

${style.bold("Keeping things in the repository")}
  pull [file]      Write the project's settings to a file
  push [file]      Apply it back (--dry-run to see the difference first)
  sourcemaps       Upload a build's maps so stacks become readable

${style.bold("Delivery")}
  deliveries       Read the delivery log
  retry            Try failed deliveries again
  health           Whether delivery is keeping up

${style.grey("Most commands take --project. In a directory with .issueit.json, they don't need it.")}
${style.grey("ISSUEIT_TOKEN and ISSUEIT_URL override the saved sign-in, for CI.")}
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.command[0];

  if (flag(args, "version") || name === "version") return say(VERSION);
  if (!name || flag(args, "help") || name === "help") {
    const wanted = name === "help" ? args.command[1] : name;
    const command = wanted ? commands[wanted] : undefined;
    if (command) {
      say(`${style.bold(wanted!)} — ${command.summary}`);
      if (command.usage) say(`\n${style.grey("Usage:")} ${command.usage}`);
      return;
    }
    return say(HELP);
  }

  const command = commands[name];
  if (!command) {
    fail(`There's no "${name}" command.`);
    const near = Object.keys(commands).filter((c) => c.startsWith(name[0]));
    if (near.length) say(style.grey(`  Did you mean: ${near.join(", ")}?`));
    say(style.grey("  Run `issueit` on its own to see them all."));
    process.exitCode = 1;
    return;
  }

  await command.run(args);
}

main().catch((err) => {
  blank();
  if (err instanceof NotSignedIn) fail(err.message);
  else if (err instanceof IssueitError) {
    fail(err.message);
    if (err.status === 403) say(style.grey("  This token wasn't granted that. Sign in again, or widen it in Settings › Account tokens."));
  } else fail((err as Error)?.message ?? String(err));
  process.exitCode = 1;
});
