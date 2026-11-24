import { describe, expect, it } from "vitest";
import { isAppHost, isAppPath, redirectFor } from "./hosts";

const split = { app: "https://dash.issueit.app", marketing: "https://issueit.app", others: ["https://drop.issueit.app", "https://cdn.issueit.app"] };

describe("isAppPath", () => {
  it("knows the dashboard's pages, and not their lookalikes", () => {
    expect(isAppPath("/dashboard")).toBe(true);
    expect(isAppPath("/projects/prj_1/keys")).toBe(true);
    expect(isAppPath("/login")).toBe(true);
    expect(isAppPath("/widget")).toBe(true);
    expect(isAppPath("/widget.js")).toBe(false);
    expect(isAppPath("/")).toBe(false);
    expect(isAppPath("/pricing")).toBe(false);
    expect(isAppPath("/settingsx")).toBe(false);
  });
});

describe("redirectFor", () => {
  it("sends the dashboard to its own host, keeping the query", () => {
    expect(redirectFor(split, "issueit.app", "/dashboard")).toBe("https://dash.issueit.app/dashboard");
    expect(redirectFor(split, "www.issueit.app", "/login", "?next=%2Finbox")).toBe("https://dash.issueit.app/login?next=%2Finbox");
    expect(redirectFor(split, "drop.issueit.app", "/inbox/rep_1")).toBe("https://dash.issueit.app/inbox/rep_1");
  });

  it("sends marketing pages to the marketing host", () => {
    expect(redirectFor(split, "dash.issueit.app", "/pricing")).toBe("https://issueit.app/pricing");
    expect(redirectFor(split, "cdn.issueit.app", "/")).toBe("https://issueit.app/");
  });

  it("opens the dashboard at the dashboard's own root", () => {
    expect(redirectFor(split, "dash.issueit.app", "/")).toBe("https://dash.issueit.app/start");
  });

  it("leaves what's already in the right place alone", () => {
    expect(redirectFor(split, "dash.issueit.app", "/projects")).toBeNull();
    expect(redirectFor(split, "issueit.app", "/")).toBeNull();
    expect(redirectFor(split, "issueit.app", "/pricing")).toBeNull();
    expect(redirectFor(split, "dash.issueit.app", "/docs/collect/roblox")).toBeNull();
    expect(redirectFor(split, "docs.issueit.app", "/dashboard")).toBeNull();
  });

  it("leaves hosts it doesn't know alone, so a rewritten Host header can't loop", () => {
    expect(redirectFor(split, "app:8380", "/dashboard")).toBeNull();
    expect(redirectFor(split, "192.168.0.62:8380", "/")).toBeNull();
  });

  it("does nothing on a single-origin install", () => {
    const one = { app: "https://bugs.example.com", marketing: "https://bugs.example.com" };
    expect(redirectFor(one, "bugs.example.com", "/dashboard")).toBeNull();
    expect(redirectFor(one, "10.0.0.5:8380", "/dashboard")).toBeNull();
  });
});

describe("isAppHost", () => {
  it("answers on a split install, and defers to the path on a single one", () => {
    expect(isAppHost(split, "dash.issueit.app")).toBe(true);
    expect(isAppHost(split, "issueit.app")).toBe(false);
    expect(isAppHost({ app: "https://bugs.example.com", marketing: "https://bugs.example.com" }, "bugs.example.com")).toBeNull();
  });
});
