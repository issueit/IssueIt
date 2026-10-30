/**
 * Fixed-window counters held in memory. Issueit runs as a single process by
 * default, so this is enough; a second instance would need a shared store.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type Limit = { key: string; max: number; windowMs: number };

export function hit(limit: Limit): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let w = windows.get(limit.key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + limit.windowMs };
    windows.set(limit.key, w);
  }
  w.count += 1;
  return { ok: w.count <= limit.max, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
}

/** Checks every limit and only counts against them if all pass. */
export function hitAll(limits: Limit[]): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  for (const l of limits) {
    const w = windows.get(l.key);
    if (w && w.resetAt > now && w.count >= l.max) return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  for (const l of limits) hit(l);
  return { ok: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}, 60_000).unref();
