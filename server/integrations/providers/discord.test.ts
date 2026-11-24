import { afterEach, describe, expect, it, vi } from "vitest";
import { discord } from "./discord";
import { cleanDiscordMessage, fromDiscord } from "../../ingest/webhook";
import type { ReportPayload } from "../types";

const report = (extra: Partial<ReportPayload> = {}): ReportPayload =>
  ({
    id: "rep_1",
    number: 1,
    title: "Bug report",
    description: "Patties get stuck under mats",
    status: "new",
    priority: "medium",
    source: "roblox",
    environment: null,
    pageUrl: null,
    browser: null,
    context: {},
    reporter: { email: null, name: null },
    metadata: {},
    diagnostics: {},
    attachments: [],
    project: { id: "prj_1", name: "Doflip" },
    dashboardUrl: "https://dash.issueit.app/inbox/rep_1",
    createdAt: "2026-11-24T02:34:00.000Z",
    ...extra,
  }) as ReportPayload;

const connection = { credentials: { webhookUrl: "https://discord.com/api/webhooks/1/abc" }, account: { label: "x", extra: { guildId: "9" } } };

/** Captures what would have gone to Discord, answering each call in turn. */
function discordAnswers(...answers: Array<{ status: number; body: unknown }>) {
  const sent: any[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    sent.push(JSON.parse(String(init!.body)));
    const a = answers[Math.min(sent.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  });
  return sent;
}

afterEach(() => vi.restoreAllMocks());

const deliver = (r: ReportPayload) => discord.deliver({ report: r, connection, isTest: false } as never);

describe("delivering to Discord", () => {
  it("sends a report with its own design as that design", async () => {
    const post = {
      username: "Bug report",
      embeds: [
        {
          author: { name: "Taxevasio80 (@Taxevasio80) • 5372893481" },
          title: "🍔 Bug report",
          description: "Patties get stuck under mats and mold and cannot be grabbed, please fix this!",
          color: 0x5865f2,
          footer: { text: "Place 89736662164742 v866 • Server 1a82498f" },
          timestamp: "2026-11-24T02:34:00Z",
        },
      ],
    };
    const sent = discordAnswers({ status: 200, body: { id: "m1", channel_id: "c1" } });
    const result = await deliver(report({ discord: cleanDiscordMessage(fromDiscord(post).discord) }));
    expect(sent).toHaveLength(1);
    expect(sent[0].username).toBe("Bug report");
    expect(sent[0].allowed_mentions).toEqual({ parse: [] });
    expect(sent[0].embeds[0]).toEqual({ ...post.embeds[0], timestamp: "2026-11-24T02:34:00.000Z" });
    expect(result.externalUrl).toBe("https://discord.com/channels/9/c1/m1");
  });

  it("falls back to Issueit's layout when Discord refuses the design", async () => {
    const sent = discordAnswers({ status: 400, body: { message: "Invalid Form Body" } }, { status: 200, body: { id: "m2", channel_id: "c1" } });
    await deliver(report({ discord: { username: "Bug report", embeds: [{ title: "x" }] } }));
    expect(sent).toHaveLength(2);
    expect(sent[1].username).toBe("Issueit");
    expect(sent[1].embeds[0].url).toBe("https://dash.issueit.app/inbox/rep_1");
  });

  it("uses Issueit's layout for a report without a design", async () => {
    const sent = discordAnswers({ status: 200, body: { id: "m3" } });
    await deliver(report());
    expect(sent[0].username).toBe("Issueit");
  });
});

describe("cleanDiscordMessage", () => {
  it("keeps a design within Discord's limits and drops what isn't safe", () => {
    const m = cleanDiscordMessage({
      username: "Shop",
      avatar_url: "javascript:alert(1)",
      content: "hi",
      embeds: [
        { title: "t".repeat(300), color: 0x1000000, thumbnail: { url: "https://x.test/a.png" }, image: { url: "ftp://nope" }, fields: Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, value: "v" })) },
        "junk",
        {},
      ],
    })!;
    expect(m.avatar_url).toBeUndefined();
    expect(m.embeds).toHaveLength(1);
    expect(m.embeds[0].title!.length).toBe(256);
    expect(m.embeds[0].color).toBeUndefined();
    expect(m.embeds[0].thumbnail).toEqual({ url: "https://x.test/a.png" });
    expect(m.embeds[0].image).toBeUndefined();
    expect(m.embeds[0].fields).toHaveLength(25);
  });

  it("stays under 6000 characters in all", () => {
    const big = { embeds: Array.from({ length: 10 }, () => ({ description: "d".repeat(4096) })) };
    const m = cleanDiscordMessage(big)!;
    const total = m.embeds.reduce((n, e) => n + (e.description?.length ?? 0), 0);
    expect(total).toBeLessThanOrEqual(6000);
  });

  it("is nothing when there's nothing to show", () => {
    expect(cleanDiscordMessage({ embeds: [{}] })).toBeNull();
    expect(cleanDiscordMessage("x")).toBeNull();
  });
});
