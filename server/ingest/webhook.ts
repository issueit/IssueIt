/**
 * Discord-shaped webhooks, turned into reports.
 *
 * Discord refuses requests from Roblox game servers, so a Roblox game that
 * wants to post anywhere needs something in between. Issueit is that: the
 * game keeps its existing webhook code and points it at
 * /v1/{project}/webhook/{secret key} instead of discord.com. Each post
 * becomes a report and goes wherever the project delivers, Discord
 * included, since Issueit's own servers aren't refused.
 *
 * Kept pure so it can be tested without a database: in comes whatever the
 * caller sent, out comes something the ordinary report schema can validate.
 */

type Embed = {
  title?: unknown;
  description?: unknown;
  url?: unknown;
  timestamp?: unknown;
  author?: { name?: unknown };
  footer?: { text?: unknown };
  fields?: Array<{ name?: unknown; value?: unknown }>;
};

export type HookDefaults = { priority?: string; environment?: string; source?: string };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** A post in Discord's shape, rather than a report in Issueit's own. */
export function looksLikeDiscord(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.title === "string") return false;
  return typeof o.content === "string" || Array.isArray(o.embeds);
}

/** Markdown that reads badly in a one-line title: emphasis, headings, quotes, code ticks. */
function plainLine(s: string) {
  return s
    .replace(/^\s*(#{1,3}\s+|>\s+|-#\s+)/, "")
    .replace(/(\*\*|__|~~|\|\||`)/g, "")
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const firstLine = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";

/** A field named like one of the report's own settings sets it. */
const settingFields: Record<string, keyof HookDefaults> = { priority: "priority", severity: "priority", environment: "environment", env: "environment" };

export function fromDiscord(raw: Record<string, unknown>, defaults: HookDefaults = {}): Record<string, unknown> {
  const content = text(raw.content);
  const username = text(raw.username).slice(0, 80);
  const embeds = (Array.isArray(raw.embeds) ? raw.embeds : []).filter((e): e is Embed => !!e && typeof e === "object").slice(0, 10);
  const lead = embeds[0];

  let title = "";
  let titleFrom: "embed" | "content" | null = null;
  if (lead && text(lead.title)) {
    title = plainLine(text(lead.title));
    titleFrom = "embed";
  } else if (content) {
    title = plainLine(firstLine(content));
    titleFrom = "content";
  } else if (lead && text(lead.author?.name)) {
    title = plainLine(text(lead.author!.name));
  } else if (lead && text(lead.description)) {
    title = plainLine(firstLine(text(lead.description)));
  }
  if (!title) title = username ? `Message from ${username}` : "Webhook message";

  const parts: string[] = [];
  // The content's first line became the title; the rest is still worth keeping.
  const contentRest = titleFrom === "content" ? content.split(/\r?\n/).slice(1).join("\n").trim() : content;
  if (contentRest) parts.push(contentRest);

  const settings: HookDefaults = {};
  const metadata: Record<string, string> = {};
  embeds.forEach((e, i) => {
    const block: string[] = [];
    const heading = text(e.title);
    if (heading && !(i === 0 && titleFrom === "embed")) block.push(`### ${heading}`);
    if (text(e.author?.name) && !(i === 0 && !titleFrom)) block.push(`*${text(e.author!.name)}*`);
    if (text(e.description)) block.push(text(e.description));
    for (const f of Array.isArray(e.fields) ? e.fields.slice(0, 25) : []) {
      const name = text(f?.name);
      const value = text(f?.value);
      if (!name && !value) continue;
      block.push(name ? `**${name}**: ${value}` : value);
      const setting = settingFields[name.toLowerCase()];
      if (setting && value && !settings[setting]) settings[setting] = plainLine(value).slice(0, 40);
      else if (name && Object.keys(metadata).length < 40) metadata[name.slice(0, 100)] = value.slice(0, 1024);
    }
    if (text(e.footer?.text)) block.push(`*${text(e.footer!.text)}*`);
    if (block.length) parts.push(block.join("\n"));
  });
  if (username) metadata.webhook_username = username;

  const leadUrl = text(lead?.url);
  return {
    title: clip(title, 200),
    description: clip(parts.join("\n\n"), 20000),
    priority: settings.priority || defaults.priority || undefined,
    environment: settings.environment || defaults.environment || undefined,
    source: defaults.source,
    name: username || undefined,
    page_url: /^https?:\/\//i.test(leadUrl) ? leadUrl.slice(0, 2000) : undefined,
    metadata,
  };
}

/** An Issueit report sent to the webhook address: the address's defaults fill only what it left out. */
export function withDefaults(raw: Record<string, unknown>, defaults: HookDefaults): Record<string, unknown> {
  return {
    ...raw,
    priority: raw.priority ?? raw.severity ?? defaults.priority,
    environment: raw.environment ?? defaults.environment,
    source: raw.source ?? defaults.source,
  };
}

/** Roblox's HttpService says who it is, and nothing else does. */
export const isRobloxAgent = (ua: string | undefined) => !!ua && /^Roblox\//i.test(ua);
