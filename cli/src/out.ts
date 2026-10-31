/**
 * Terminal output. Colour only when a person is watching, never when the
 * output is being piped somewhere, and plain enough to read in a log.
 */

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (text: string) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);

export const style = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  grey: wrap("90"),
};

export const say = (...parts: unknown[]): void => void process.stdout.write(`${parts.join(" ")}\n`);
export const blank = (): void => void process.stdout.write("\n");
export const warn = (...parts: unknown[]): void => void process.stderr.write(`${style.yellow("!")} ${parts.join(" ")}\n`);
export const fail = (...parts: unknown[]): void => void process.stderr.write(`${style.red("✗")} ${parts.join(" ")}\n`);
export const done = (...parts: unknown[]): void => void process.stdout.write(`${style.green("✓")} ${parts.join(" ")}\n`);

export const priorityColour = (priority: string) =>
  priority === "critical" ? style.red(priority) : priority === "high" ? style.yellow(priority) : style.grey(priority);

export const statusColour = (status: string) =>
  status === "resolved" ? style.green(status) : status === "new" ? style.blue(status) : style.grey(status);

/** Columns sized to their contents, which is all a table in a terminal needs. */
export function table(head: string[], rows: string[][]) {
  if (!rows.length) return;
  const widths = head.map((h, i) => Math.max(visible(h), ...rows.map((r) => visible(r[i] ?? ""))));
  const line = (cells: string[], paint: (s: string) => string = (s) => s) =>
    say(cells.map((cell, i) => paint(pad(cell ?? "", widths[i]))).join("  "));
  line(head, style.grey);
  for (const row of rows) line(row);
}

/** Pads to a visible width, ignoring the colour codes inside. */
const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - visible(text)));
// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\u001b\[\d+m/g, "").length;

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
