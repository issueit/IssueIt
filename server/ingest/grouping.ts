import { sha256 } from "../lib/crypto";

/**
 * Duplicate grouping. Each report gets a fingerprint; a report whose
 * fingerprint matches an open report in the same project joins that
 * report's group instead of being delivered again. Once the first report
 * is resolved or closed, the next match starts a new group, so a bug that
 * comes back is noticed.
 */

/**
 * Lower case, no punctuation, digits and ids folded, so "Error #4012 on save!"
 * matches "error #77 on save". Three-digit HTTP status codes stay: a 500 and a
 * 404 are different bugs.
 */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, " ")
    .replace(/\d+/g, (n) => (/^[1-5]\d\d$/.test(n) ? ` s${n} ` : " "))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The page without its query, hash or ids: /orders/8812/edit and /orders/91/edit are the same page. */
export function normalisePath(pageUrl: string | null | undefined): string {
  if (!pageUrl) return "";
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return "";
  }
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) || /^[0-9a-f-]{16,}$/i.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s) ? ":id" : s.toLowerCase()));
  return `${url.host.toLowerCase()}/${segments.join("/")}`;
}

/**
 * A caller's own fingerprint wins (an error id, a crash signature). Otherwise
 * the normalised title and page decide. Titles that normalise to nothing
 * don't group: "!!!" and "???" are not the same bug.
 */
export function fingerprintFor(input: { fingerprint?: string | null; title: string; pageUrl?: string | null }): string | null {
  const explicit = input.fingerprint?.trim();
  if (explicit) return `x:${sha256(explicit).slice(0, 32)}`;
  const title = normaliseTitle(input.title);
  if (title.length < 3) return null;
  return `t:${sha256(`${title}\n${normalisePath(input.pageUrl)}`).slice(0, 32)}`;
}

/**
 * Trackers hear about repeats at these group sizes, not on every one, so an
 * issue gets a handful of comments rather than hundreds.
 */
export function isMilestone(total: number): boolean {
  if (total < 2) return false;
  if ([2, 3, 5, 10, 25, 50, 100, 250, 500].includes(total)) return true;
  return total >= 1000 && total % 1000 === 0;
}
