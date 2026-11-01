import { sql } from "drizzle-orm";
import { db } from "../db";
import type { ProjectProtection } from "../db/schema";
import { keyedHash, sha256 } from "../lib/crypto";

/**
 * Deciding whether a submission is worth taking seriously.
 *
 * Two jobs, both about public submissions only. A project id is printed in
 * the page source of every site that uses the widget, so anyone who views
 * source can post to it, and link spam addressed to a contact form is as old
 * as contact forms.
 *
 * The important part is where this sits. Nothing is refused and nothing is
 * thrown away on a guess: a report that looks like spam is stored, counted
 * against nobody, and held back from delivery. Delivery is the step that
 * can't be taken back — a Jira ticket exists, a Slack channel has been
 * pinged, a reporter has had an email — so delivery is what gets gated, and
 * a false positive costs one click on "not spam" instead of a lost bug
 * report from a real user.
 *
 * Reports sent with a secret key or a short-lived token are never scored.
 * Those came from the project's own server or its signed-in app, which has
 * already decided who it believes.
 */

export const DEFAULT_THRESHOLD = 6;

/** Held back at or above this score. */
export const thresholdFor = (protection: ProjectProtection): number => {
  const asked = protection.spam?.threshold;
  return asked && asked > 0 ? asked : DEFAULT_THRESHOLD;
};

export const spamCheckEnabled = (protection: ProjectProtection): boolean => protection.spam?.enabled !== false;

/* --------------------------------------------------------------- blocking */

export type Reporter = { ipHash: string; email: string | null };

/**
 * A reporter this project has blocked. Answered without a database query:
 * the list lives on the project row that intake already loaded.
 *
 * Addresses and domains are matched as typed. Addresses can't be verified,
 * so blocking one stops a nuisance rather than a determined person — the
 * address hash is the part that costs something to change.
 */
export function isBlocked(protection: ProjectProtection, who: Reporter): boolean {
  const block = protection.block;
  if (!block) return false;
  if (block.ipHashes?.includes(who.ipHash)) return true;
  // Typed-in addresses are hashed with the same key the stored hash uses.
  if (block.ips?.some((ip) => keyedHash(ip.trim()) === who.ipHash)) return true;
  if (!who.email) return false;
  const email = who.email.trim().toLowerCase();
  if (block.emails?.some((e) => e.trim().toLowerCase() === email)) return true;
  const domain = email.split("@")[1];
  return !!domain && !!block.domains?.some((d) => d.trim().toLowerCase().replace(/^@/, "") === domain);
}

/* ---------------------------------------------------------------- scoring */

/**
 * Phrases that belong to the trade being advertised rather than to anything
 * a person reports about software. Each one is worth little on its own: a
 * real report can say "the casino page 404s", and one weak signal must never
 * be enough on its own.
 */
const TRADE = [
  "casino",
  "cialis",
  "viagra",
  "escort",
  "payday loan",
  "forex",
  "binary option",
  "crypto signal",
  "bitcoin doubler",
  "nft drop",
  "airdrop",
  "backlink",
  "guest post",
  "seo service",
  "seo expert",
  "buy followers",
  "cheap flight",
  "replica watch",
  "weight loss pill",
  "work from home",
  "make money online",
  "whatsapp me",
  "telegram channel",
  "contact us on whatsapp",
  "dm me",
  "click here now",
  "limited time offer",
  "100% free",
  "earn \\$",
  "visit my (site|website|profile)",
  "best price",
  "hack(ed|ing)? (account|wallet)",
  "recover (your )?(lost )?(funds|bitcoin|crypto)",
];

const tradePattern = new RegExp(`\\b(?:${TRADE.join("|")})\\b`, "gi");

/** Addresses nobody keeps. One signal among several, never a refusal on its own. */
export const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "cock.li",
  "dispostable.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "harakirimail.com",
  "inboxbear.com",
  "mail-temp.com",
  "mail7.io",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.io",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.net",
]);

export const isDisposable = (email: string): boolean => DISPOSABLE_DOMAINS.has(email.trim().toLowerCase().split("@")[1] ?? "");

const linkPattern = /\b(?:https?:\/\/|www\.)[^\s<>()[\]]{3,}/gi;
const markupLinkPattern = /\[url[=\]]|<a\s+[^>]*href=/gi;

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

export type Submission = {
  title: string;
  description: string;
  pageUrl: string | null;
  reporterEmail: string | null;
  /** True when the widget sent console, network or step capture with it. */
  hasDiagnostics: boolean;
  source: string;
};

export type Velocity = {
  /** Reports from this address in this project in the last hour. */
  fromAddressThisHour: number;
  /** Reports from this address in this project in the last day. */
  fromAddressToday: number;
  /** Times this exact text has arrived in this project in the last hour. */
  sameTextThisHour: number;
};

export type SpamVerdict = {
  score: number;
  /** In the words the dashboard shows, so nobody has to guess what tripped. */
  reasons: string[];
  /** At or above the project's threshold. */
  spam: boolean;
};

/**
 * Adds up what's suspicious about one submission. Nothing here looks
 * anything up, talks to anything, or costs more than a few regular
 * expressions; the counts it needs are gathered in one query by
 * `velocityFor`.
 */
export function scoreSpam(submission: Submission, velocity: Velocity, protection: ProjectProtection): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, why: string) => {
    score += points;
    reasons.push(why);
  };

  const title = submission.title ?? "";
  const description = submission.description ?? "";
  const body = `${title}\n${description}`;

  if (!protection.spam?.allowLinks) {
    const links = count(body, linkPattern);
    const inTitle = count(title, linkPattern);
    // One link is how a person says which page they mean. Several, or any in
    // the title, is how a link farm says hello.
    if (links >= 3) add(4, `${links} links`);
    else if (links === 2) add(2, "two links");
    if (inTitle) add(3, "a link in the title");
    if (count(body, markupLinkPattern) >= 2) add(3, "markup links in the text");
  }

  const trade = [...new Set((body.match(tradePattern) ?? []).map((m) => m.toLowerCase()))];
  if (trade.length) add(Math.min(trade.length * 2, 6), `advertising language (${trade.slice(0, 3).join(", ")})`);

  const own = (protection.spam?.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const ownHits = own.filter((k) => body.toLowerCase().includes(k));
  if (ownHits.length) add(Math.min(ownHits.length * 3, 6), `words this project blocks (${ownHits.slice(0, 3).join(", ")})`);

  // One address filing dozens of reports in an hour is either a loop or a run.
  if (velocity.fromAddressThisHour > 20) add(4, `${velocity.fromAddressThisHour} reports from this reporter in an hour`);
  else if (velocity.fromAddressThisHour > 8) add(2, `${velocity.fromAddressThisHour} reports from this reporter in an hour`);
  if (velocity.fromAddressToday > 50) add(2, `${velocity.fromAddressToday} reports from this reporter today`);

  // The same text again and again, which grouping would have caught if it
  // were the same bug on the same page.
  if (velocity.sameTextThisHour >= 5) add(3, "the same text many times in an hour");
  else if (velocity.sameTextThisHour >= 3) add(1, "the same text several times in an hour");

  if (submission.reporterEmail && isDisposable(submission.reporterEmail)) add(2, "a throwaway email address");

  // A sales pitch is addressed to a company, so it has no page and nothing
  // the widget captured. A real report usually has both.
  if (!submission.pageUrl && !submission.hasDiagnostics && description.length > 400) add(2, "a long message with no page and nothing captured");

  if (title.length > 20 && title === title.toUpperCase() && /[A-Z]/.test(title)) add(1, "a title in capitals");
  if (/(.)\1{9,}/.test(body)) add(1, "a run of repeated characters");

  const threshold = thresholdFor(protection);
  return { score, reasons, spam: spamCheckEnabled(protection) && score >= threshold };
}

/** The hash used to spot the same text arriving again. Case and spacing don't count. */
export const contentHashOf = (title: string, description: string) => sha256(`${title}\n${description}`.toLowerCase().replace(/\s+/g, " ").trim());

/** The three counts `scoreSpam` needs, in one query. */
export async function velocityFor(projectId: string, ipHash: string, contentHash: string): Promise<Velocity> {
  const [row] = await db.execute<{ hour: number; today: number; same: number }>(sql`
    select
      count(*) filter (where ip_hash = ${ipHash} and created_at > now() - interval '1 hour')::int as hour,
      count(*) filter (where ip_hash = ${ipHash} and created_at > now() - interval '1 day')::int as today,
      count(*) filter (where content_hash = ${contentHash} and created_at > now() - interval '1 hour')::int as same
    from reports
    where project_id = ${projectId} and created_at > now() - interval '1 day'`);
  return { fromAddressThisHour: row?.hour ?? 0, fromAddressToday: row?.today ?? 0, sameTextThisHour: row?.same ?? 0 };
}
