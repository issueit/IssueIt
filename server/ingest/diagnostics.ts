import type { ConsoleEntry, Diagnostics, NetworkEntry, StepEntry } from "../db/schema";
import { scrubText, scrubUrl } from "../lib/scrub";

/**
 * Cleans what the widget captured before it's stored. Lenient by design: a
 * malformed entry is dropped rather than failing the report, since the
 * report matters more than its diagnostics. Text is scrubbed again here.
 */

const MAX_ENTRIES = 50;
const DAY = 86_400_000;

const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v.slice(-MAX_ENTRIES) : []);

function consoleEntry(raw: any): ConsoleEntry | null {
  const t = num(raw?.t, DAY);
  const message = str(raw?.message);
  const level = ["error", "warn", "info", "log"].includes(raw?.level) ? raw.level : null;
  if (t === null || !message || !level) return null;
  const stack = str(raw?.stack);
  return { t, level, message: scrubText(message, 1000), ...(stack ? { stack: scrubText(stack, 1500) } : {}) };
}

function networkEntry(raw: any): NetworkEntry | null {
  const t = num(raw?.t, DAY);
  const url = str(raw?.url);
  const method = str(raw?.method)?.toUpperCase().slice(0, 10);
  const ms = num(raw?.ms, DAY);
  if (t === null || !url || !method || ms === null) return null;
  const status = raw?.status === null ? null : num(raw?.status, 999);
  const error = str(raw?.error);
  return { t, method, url: scrubUrl(url), status: status ?? null, ms, ...(error ? { error: scrubText(error, 200) } : {}) };
}

function stepEntry(raw: any): StepEntry | null {
  const t = num(raw?.t, DAY);
  const label = str(raw?.label);
  const kind = ["click", "navigate", "input"].includes(raw?.kind) ? raw.kind : null;
  if (t === null || !label || !kind) return null;
  return { t, kind, label: kind === "navigate" ? scrubUrl(label, 300) : scrubText(label, 200) };
}

export function cleanDiagnostics(raw: unknown): Diagnostics {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Diagnostics = {};
  const c = list(r.console).map(consoleEntry).filter((e): e is ConsoleEntry => !!e);
  const n = list(r.network).map(networkEntry).filter((e): e is NetworkEntry => !!e);
  const s = list(r.steps).map(stepEntry).filter((e): e is StepEntry => !!e);
  if (c.length) out.console = c;
  if (n.length) out.network = n;
  if (s.length) out.steps = s;
  // Keep the newest entries if it's still too big to store comfortably.
  while (JSON.stringify(out).length > 64_000) {
    const longest = (["console", "network", "steps"] as const).filter((k) => out[k]?.length).sort((a, b) => out[b]!.length - out[a]!.length)[0];
    if (!longest) break;
    out[longest]!.shift();
  }
  return out;
}
