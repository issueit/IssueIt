/**
 * Removes things that look private from captured text: email addresses,
 * tokens, card numbers and the values in query strings. The widget does
 * this before sending; the server does it again, since not every report
 * comes from the widget.
 */

const patterns: Array<[RegExp, string]> = [
  // Authorization header values.
  [/\b(bearer|basic)\s+[^\s"'&,;]{4,}/gi, "$1 [redacted]"],
  // "token=…", "refreshToken": "…", x-api-key: … and the like.
  [/([\w-]*(?:token|secret|session|cookie|password|passwd|apikey|api[_-]key|auth|credential)[\w-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;]{4,}/gi, "$1$2[redacted]"],
  // JSON Web Tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // 13 to 19 digits, optionally grouped: card numbers.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[number]"],
  // Long opaque strings: keys, hashes, session ids.
  [/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]"],
];

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

export function scrubText(value: string, max = 2000, extra: Array<[RegExp, string]> = []): string {
  let out = value.slice(0, max * 2);
  for (const [re, replacement] of patterns) out = out.replace(re, replacement);
  for (const [re, replacement] of extra) out = out.replace(re, replacement);
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
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
