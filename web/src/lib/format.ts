/** Relative times, counts and sizes in the dashboard's voice. */

const units: Array<[number, string]> = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [7, "d"],
  [4.35, "w"],
  [12, "mo"],
  [Infinity, "y"],
];

/**
 * How dates read, set once from the saved settings rather than passed down
 * through every list. Components that show dates read the preferences too, so
 * they re-render when the answer arrives.
 */
let dateStyle: "relative" | "absolute" = "relative";
let clock: "24h" | "12h" = "24h";

export function setDateFormat(next: { dates: "relative" | "absolute"; clock: "24h" | "12h" }) {
  dateStyle = next.dates;
  clock = next.clock;
}

/** Short enough for a column: "31 Oct 14:32", or "31 Oct" without the suffix. */
function shortDate(date: Date, withTime: boolean) {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit", hour12: clock === "12h" } as const) : {}),
  });
}

export function relativeTime(value: string | Date | null | undefined, suffix = true): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (dateStyle === "absolute") return shortDate(date, suffix);
  let delta = (Date.now() - date.getTime()) / 1000;
  const future = delta < 0;
  delta = Math.abs(delta);
  if (delta < 45) return future ? "in a moment" : "just now";
  for (const [size, unit] of units) {
    if (delta < size) {
      const n = Math.max(1, Math.floor(delta));
      const text = `${n}${unit}`;
      return suffix ? (future ? `in ${text}` : `${text} ago`) : text;
    }
    delta /= size;
  }
  return date.toLocaleDateString("en-GB");
}

export function fullDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: clock === "12h" });
}

/** "1 report", "3 reports". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? singular : pluralForm}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
