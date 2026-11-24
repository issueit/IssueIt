import type { DiscordEmbed, DiscordMessage } from "../db/schema";
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

export type HookDefaults = { priority?: string; environment?: string; source?: string; channel?: string };

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
    channel: defaults.channel,
    name: (lead && plainLine(text(lead.author?.name)).slice(0, 80)) || username || undefined,
    // The post as designed, so Discord destinations can send it on looking the same.
    discord: raw,
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
    // The address names the channel; a body can't send it somewhere else.
    ...(defaults.channel ? { channel: defaults.channel } : {}),
  };
}

/** Roblox's HttpService says who it is, and nothing else does. */
export const isRobloxAgent = (ua: string | undefined) => !!ua && /^Roblox\//i.test(ua);

/**
 * Why a key that starts like one matched nothing, as precisely as can be
 * said without repeating it: keys end up in game consoles and screenshots,
 * so only the characters that shouldn't be there are named.
 */
export function whyNoKey(token: string): string {
  if (/…|\.\.\.|[<>{}]|x{4,}/i.test(token)) return "It looks like a placeholder from an example, not a real key. Copy yours from the project's API keys.";
  const odd = [...new Set(token.replace(/[A-Za-z0-9_]/g, ""))].slice(0, 5);
  if (odd.length) return `It contains ${odd.map((ch) => JSON.stringify(ch)).join(", ")}, which a key never does, so something extra was copied with it.`;
  if (token.length < 30) return `It's only ${token.length} characters long, so it was probably cut off when it was copied.`;
  return "It may have been rotated: copy the current one from the project's API keys.";
}

/* ------------------------------------------------------------ the post's own look */

export type { DiscordEmbed, DiscordMessage };

const cut = (v: unknown, max: number) => {
  const s = text(v);
  return s ? (s.length > max ? `${s.slice(0, max - 1)}…` : s) : undefined;
};
const link = (v: unknown) => {
  const s = text(v);
  return /^https?:\/\/\S+$/i.test(s) && s.length <= 2000 ? s : undefined;
};
const prune = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

/**
 * The sender's design, kept within Discord's own limits so that sending it
 * on can't be refused for size: titles 256, descriptions 4096, 25 fields,
 * 10 embeds, 6000 characters in all. Links must be http(s). Anything else
 * is dropped rather than refused — the report matters more than its looks.
 */
export function cleanDiscordMessage(raw: unknown): DiscordMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  let budget = 6000;
  const take = (v: unknown, max: number) => {
    const s = cut(v, Math.min(max, budget));
    if (s) budget -= s.length;
    return budget > 0 ? s : undefined;
  };
  const embeds: DiscordEmbed[] = [];
  for (const e of (Array.isArray(o.embeds) ? o.embeds : []).slice(0, 10)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, any>;
    const color = typeof r.color === "number" && Number.isInteger(r.color) && r.color >= 0 && r.color <= 0xffffff ? r.color : undefined;
    const timestamp = typeof r.timestamp === "string" && !Number.isNaN(Date.parse(r.timestamp)) ? new Date(r.timestamp).toISOString() : undefined;
    const authorName = take(r.author?.name, 256);
    const footerText = take(r.footer?.text, 2048);
    const fields = (Array.isArray(r.fields) ? r.fields : [])
      .slice(0, 25)
      .map((f: any) => ({ name: take(f?.name, 256), value: take(f?.value, 1024), inline: f?.inline === true ? true : undefined }))
      .filter((f: { name?: string; value?: string }) => f.name && f.value) as DiscordEmbed["fields"];
    const embed = prune({
      title: take(r.title, 256),
      description: take(r.description, 4096),
      url: link(r.url),
      color,
      timestamp,
      author: authorName ? prune({ name: authorName, url: link(r.author?.url), icon_url: link(r.author?.icon_url) }) : undefined,
      footer: footerText ? prune({ text: footerText, icon_url: link(r.footer?.icon_url) }) : undefined,
      thumbnail: link(r.thumbnail?.url) ? { url: link(r.thumbnail.url)! } : undefined,
      image: link(r.image?.url) ? { url: link(r.image.url)! } : undefined,
      fields: fields?.length ? fields : undefined,
    });
    if (Object.keys(embed).length) embeds.push(embed);
  }
  const message = prune({ username: cut(o.username, 80), avatar_url: link(o.avatar_url), content: take(o.content, 2000), embeds });
  return message.embeds.length || message.content ? message : null;
}
