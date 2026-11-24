import { describe, expect, it } from "vitest";
import { fromDiscord, isRobloxAgent, looksLikeDiscord, withDefaults } from "./webhook";

describe("looksLikeDiscord", () => {
  it("tells a Discord post from an Issueit report", () => {
    expect(looksLikeDiscord({ content: "hi" })).toBe(true);
    expect(looksLikeDiscord({ embeds: [] })).toBe(true);
    expect(looksLikeDiscord({ title: "Broken", content: "x" })).toBe(false);
    expect(looksLikeDiscord([{ content: "x" }])).toBe(false);
    expect(looksLikeDiscord(null)).toBe(false);
  });
});

describe("fromDiscord", () => {
  it("takes the title from the first line of content and keeps the rest", () => {
    const r = fromDiscord({ content: "**Shop is broken**\nPlayer 123 couldn't buy the sword", username: "Game Logs" });
    expect(r.title).toBe("Shop is broken");
    expect(r.description).toBe("Player 123 couldn't buy the sword");
    expect(r.name).toBe("Game Logs");
    expect(r.metadata).toEqual({ webhook_username: "Game Logs" });
  });

  it("prefers the first embed's title, and writes embeds out as Markdown", () => {
    const r = fromDiscord({
      content: "@here",
      embeds: [
        { title: "DataStore failed", description: "SetAsync timed out", url: "https://www.roblox.com/games/1", fields: [{ name: "Key", value: "player_42" }, { name: "Priority", value: "critical" }], footer: { text: "Server abc" } },
        { title: "Second", description: "More" },
      ],
    });
    expect(r.title).toBe("DataStore failed");
    expect(r.priority).toBe("critical");
    expect(r.page_url).toBe("https://www.roblox.com/games/1");
    expect(r.metadata).toEqual({ Key: "player_42" });
    expect(r.description).toBe("@here\n\nSetAsync timed out\n**Key**: player_42\n**Priority**: critical\n*Server abc*\n\n### Second\nMore");
  });

  it("falls back to the address's defaults, then to a title that says where it came from", () => {
    const r = fromDiscord({ embeds: [{ color: 0xff0000 }] }, { priority: "high", environment: "studio", source: "roblox" });
    expect(r.title).toBe("Webhook message");
    expect(r.priority).toBe("high");
    expect(r.environment).toBe("studio");
    expect(r.source).toBe("roblox");
    expect(fromDiscord({ content: "", username: "Bot" }).title).toBe("Message from Bot");
  });

  it("keeps titles to 200 characters and strips Markdown from them", () => {
    const r = fromDiscord({ content: `# ${"a".repeat(300)}` });
    expect((r.title as string).length).toBe(200);
    expect((r.title as string).startsWith("aaa")).toBe(true);
    expect(fromDiscord({ content: "`nil` value in <:sword:123> ~~old~~" }).title).toBe("nil value in :sword: old");
  });

  it("ignores what isn't an embed", () => {
    const r = fromDiscord({ content: "x", embeds: ["nope", null, 3] });
    expect(r.title).toBe("x");
  });
});

describe("withDefaults", () => {
  it("only fills what the report left out", () => {
    expect(withDefaults({ title: "t", priority: "low" }, { priority: "high", source: "roblox" })).toMatchObject({ priority: "low", source: "roblox" });
    expect(withDefaults({ title: "t", severity: "critical" }, { priority: "high" })).toMatchObject({ priority: "critical" });
  });
});

describe("isRobloxAgent", () => {
  it("knows HttpService", () => {
    expect(isRobloxAgent("Roblox/Linux")).toBe(true);
    expect(isRobloxAgent("Mozilla/5.0")).toBe(false);
    expect(isRobloxAgent(undefined)).toBe(false);
  });
});
