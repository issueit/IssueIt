/**
 * The redaction rules, in one place. The widget applies them in the browser
 * before anything is sent, and the server applies them again on the way in,
 * because not every report comes from the widget. Two copies of a rule like
 * these is two chances to fix only one of them, so both sides read this
 * file: the widget bundles it, the server imports it.
 */

/** Things that are a secret wherever they appear. */
export const SECRETS: Array<[RegExp, string]> = [
  // Authorization header values.
  [/\b(bearer|basic)\s+[^\s"'&,;]{4,}/gi, "$1 [redacted]"],
  // "token=…", "refreshToken": "…", x-api-key: … and the like.
  [/([\w-]*(?:token|secret|session|cookie|password|passwd|apikey|api[_-]key|auth|credential)[\w-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;]{4,}/gi, "$1$2[redacted]"],
  // JSON Web Tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // 13 to 19 digits, optionally grouped: card numbers.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[number]"],
];

/**
 * Long opaque strings: keys, hashes, session ids. Held apart from the rest
 * because it can't tell a secret from an identifier, so an address keeps its
 * own milder version of it (see scrubLink) rather than losing every id in
 * its path.
 */
export const OPAQUE: [RegExp, string] = [/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]"];

export const ALL: Array<[RegExp, string]> = [...SECRETS, OPAQUE];

/** Emails, tokens, card numbers and anything long and opaque, out. */
export function scrubText(value: string, max = 2000, extra: Array<[RegExp, string]> = []): string {
  let out = value.slice(0, max * 2);
  for (const [re, replacement] of ALL) out = out.replace(re, replacement);
  for (const [re, replacement] of extra) out = out.replace(re, replacement);
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/**
 * Parameter names whose value is a secret, or close enough. Single sign-on,
 * password resets and magic links all hand their token back in the address
 * of a perfectly ordinary page.
 */
const secretish = /token|secret|key|auth|password|passwd|session|signature|sig|code|state|nonce|otp|invite|reset|confirm|credential|jwt|assertion|email/i;

/** A UUID identifies something rather than unlocking it, and a page is much less use without it. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hideSecretParams(pairs: string): string {
  return pairs
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return pair;
      const name = pair.slice(0, eq);
      return `${name}=${secretish.test(name) && pair.length > eq + 1 ? "[redacted]" : pair.slice(eq + 1)}`;
    })
    .join("&");
}

/**
 * The address of the page a report came from. Unlike scrubUrl this keeps the
 * query's values and the fragment, because the address is often the whole
 * point of the report: a checkout that fails for one order id only fails
 * there, and a report that can't say where is hard to act on. What it
 * doesn't keep is anything that reads like a secret — the values of telling
 * parameter names, in the query and in the fragment, which is where single
 * sign-on hands tokens back, and long opaque path segments that aren't an id.
 */
export function scrubLink(raw: string, max = 2000, extra: Array<[RegExp, string]> = []): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return scrubText(raw, max, extra);
  }
  // Anything exotic has no origin worth printing, so it goes through as text.
  if (!/^https?:$/.test(url.protocol)) return scrubText(raw, max, extra);
  const path = url.pathname
    .split("/")
    .map((part) => (part.length >= 32 && /^[A-Za-z0-9_-]+$/.test(part) && !uuid.test(part) ? "[redacted]" : part))
    .join("/");
  const query = url.search.length > 1 ? `?${hideSecretParams(url.search.slice(1))}` : "";
  const hash = url.hash.length > 1 ? `#${hideSecretParams(url.hash.slice(1))}` : "";
  let out = `${url.origin}${path}${query}${hash}`;
  for (const [re, replacement] of SECRETS) out = out.replace(re, replacement);
  for (const [re, replacement] of extra) out = out.replace(re, replacement);
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/**
 * Only http and https may become a link. "javascript:…" and "data:…" are
 * valid URLs by the spec, so a shape check alone would let one through to be
 * clicked — in the dashboard, where it would run as the person reading it.
 */
export function safeLink(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw, base);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
