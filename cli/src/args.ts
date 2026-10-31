/**
 * Argument parsing, written out rather than taken as a dependency: the
 * whole of it is long flags, a few one-letter aliases, and everything else
 * in order.
 */

export type Args = { command: string[]; flags: Record<string, string | boolean> };

const ALIASES: Record<string, string> = { p: "project", h: "help", v: "version", f: "file", r: "release", n: "name" };

export function parseArgs(argv: string[]): Args {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      command.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const [name, inline] = splitOnce(arg.slice(2));
      const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (inline !== undefined) flags[key] = inline;
      // A flag takes the next word unless that word is itself a flag.
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) flags[key] = argv[++i];
      else flags[key] = true;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const key = ALIASES[arg.slice(1)] ?? arg.slice(1);
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) flags[key] = argv[++i];
      else flags[key] = true;
      continue;
    }
    command.push(arg);
  }
  return { command, flags };
}

function splitOnce(text: string): [string, string | undefined] {
  const at = text.indexOf("=");
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

export const flag = (args: Args, name: string) => args.flags[name] === true || args.flags[name] === "true";
export const value = (args: Args, name: string): string | undefined => (typeof args.flags[name] === "string" ? (args.flags[name] as string) : undefined);
