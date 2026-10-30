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

export function relativeTime(value: string | Date | null | undefined, suffix = true): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
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
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
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
