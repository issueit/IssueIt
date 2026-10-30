import type { Analytics, Count } from "../../lib/types";

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB");

export const formatNumber = (n: number, mode: "compact" | "full") => (mode === "compact" && Math.abs(n) >= 10_000 ? compact.format(n) : full.format(n));

export function formatMs(ms: number | null) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${+(s / 3600).toFixed(1)}h`;
  return `${+(s / 86400).toFixed(1)}d`;
}

/** Change against the previous period, or null when there's nothing to compare with. */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Buckets arrive as local "2026-10-30", "2026-10-30T14" or "2026-10". */
export function bucketLabel(bucket: string, unit: Analytics["unit"], long = false): string {
  if (unit === "month") {
    const [y, m] = bucket.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", long ? { month: "long", year: "numeric" } : { month: "short" });
  }
  if (unit === "hour") {
    const [day, hour] = bucket.split("T");
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d, Number(hour));
    return long ? date.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : `${hour}:00`;
  }
  const [y, m, d] = bucket.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (unit === "week") return long ? `Week of ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return date.toLocaleDateString("en-GB", long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
}

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en-GB"], { type: "region" }) : null;
export const countryName = (code: string) => {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

export const statusLabel: Record<string, string> = { new: "New", investigating: "Investigating", resolved: "Resolved", closed: "Closed" };
export const priorityOrder = ["critical", "high", "medium", "low"] as const;
export const priorityLabel: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const sourceLabel = (s: string) => ({ widget: "Widget", form: "Hosted form", api: "API" })[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

/** Keeps the biggest `top` and folds the tail into "Other", so a chart never needs a ninth colour. */
export function topWithOther(rows: Count[], top: number): Count[] {
  if (rows.length <= top) return rows;
  const head = rows.slice(0, top - 1);
  const rest = rows.slice(top - 1).reduce((n, r) => n + r.n, 0);
  return [...head, { key: "__other", n: rest }];
}
