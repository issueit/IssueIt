/**
 * Removes things that look private from captured text: email addresses,
 * tokens, card numbers and the values in query strings. The rules themselves
 * live in shared/scrub.ts, because the widget applies them in the browser
 * first; what's here is the server's side of it — a project's own patterns,
 * and the shorter form a diagnostic URL is stored in.
 */

import { scrubText } from "../../shared/scrub";

export { scrubLink, scrubText } from "../../shared/scrub";

/**
 * A project's own patterns, compiled once and reused. A pattern that doesn't
 * compile is skipped rather than failing a report: losing one redaction rule
 * is better than losing the bug it was in.
 */
export type ExtraPattern = { pattern: string; replacement?: string; label?: string };

const compiled = new Map<string, Array<[RegExp, string]>>();

export function compilePatterns(extra: ExtraPattern[] | undefined): Array<[RegExp, string]> {
  if (!extra?.length) return [];
  const key = JSON.stringify(extra);
  const cached = compiled.get(key);
  if (cached) return cached;
  const list: Array<[RegExp, string]> = [];
  for (const rule of extra.slice(0, 30)) {
    try {
      list.push([new RegExp(rule.pattern, "gi"), rule.replacement ?? `[${rule.label || "redacted"}]`]);
    } catch {
      // An invalid pattern is reported back when it's saved; here it's ignored.
    }
  }
  if (compiled.size > 200) compiled.clear();
  compiled.set(key, list);
  return list;
}

/** Keeps a URL's origin and path, and the names of its query parameters without their values. */
export function scrubUrl(raw: string, max = 500, extra: Array<[RegExp, string]> = []): string {
  let url: URL;
  try {
    url = new URL(raw, "http://relative.invalid");
  } catch {
    return scrubText(raw.split("?")[0], max, extra);
  }
  const names = [...new Set([...url.searchParams.keys()])].slice(0, 10);
  const base = url.origin === "http://relative.invalid" ? url.pathname : `${url.origin}${url.pathname}`;
  const query = names.length ? `?${names.map((n) => `${encodeURIComponent(n)}=…`).join("&")}` : "";
  return scrubText(base, max - query.length, extra) + query;
}
