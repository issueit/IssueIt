import { describe, expect, it } from "vitest";
import { contentHashOf, isBlocked, isDisposable, scoreSpam, type Submission, type Velocity } from "./protection";
import { keyedHash } from "../lib/crypto";

const quiet: Velocity = { fromAddressThisHour: 1, fromAddressToday: 1, sameTextThisHour: 1 };

const report = (over: Partial<Submission> = {}): Submission => ({
  title: "Checkout button does nothing on the second click",
  description: "I clicked Pay and the spinner never stopped. Reloading didn't help.",
  pageUrl: "https://shop.example.com/checkout",
  reporterEmail: "jo@example.com",
  hasDiagnostics: true,
  source: "widget",
  ...over,
});

describe("spam scoring", () => {
  it("lets an ordinary bug report through", () => {
    const verdict = scoreSpam(report(), quiet, {});
    expect(verdict.spam).toBe(false);
    expect(verdict.score).toBe(0);
  });

  it("doesn't mind one link, which is how people say which page they mean", () => {
    expect(scoreSpam(report({ description: "Broken here: https://shop.example.com/cart" }), quiet, {}).spam).toBe(false);
  });

  it("holds back a link farm", () => {
    const verdict = scoreSpam(
      report({
        title: "Best SEO service https://buy-links.example",
        description: "Cheap backlink and guest post packages https://a.example https://b.example https://c.example",
        pageUrl: null,
        hasDiagnostics: false,
      }),
      quiet,
      {},
    );
    expect(verdict.spam).toBe(true);
    expect(verdict.reasons.join(" ")).toContain("link");
  });

  it("needs more than one weak signal", () => {
    // A real report that happens to mention a blocked trade, and nothing else.
    const verdict = scoreSpam(report({ title: "The casino page 404s", description: "Clicking Games from the menu gives a 404." }), quiet, {});
    expect(verdict.spam).toBe(false);
  });

  it("counts a reporter filing dozens in an hour", () => {
    const verdict = scoreSpam(report(), { fromAddressThisHour: 40, fromAddressToday: 60, sameTextThisHour: 1 }, {});
    expect(verdict.score).toBeGreaterThan(0);
    expect(verdict.reasons.join(" ")).toContain("40 reports");
  });

  it("respects a project that says links are normal", () => {
    const submission = report({ title: "Docs link wrong https://a.example", description: "https://b.example https://c.example https://d.example" });
    expect(scoreSpam(submission, quiet, {}).score).toBeGreaterThan(scoreSpam(submission, quiet, { spam: { allowLinks: true } }).score);
  });

  it("takes a project's own words seriously", () => {
    const submission = report({ title: "Buy my course", description: "Enrol in my course today." });
    expect(scoreSpam(submission, quiet, {}).spam).toBe(false);
    expect(scoreSpam(submission, quiet, { spam: { keywords: ["my course"], threshold: 3 } }).spam).toBe(true);
  });

  it("can be turned off entirely, and still says what it thought", () => {
    const obvious = report({ title: "casino viagra https://a.example https://b.example https://c.example", description: "backlink seo service", pageUrl: null, hasDiagnostics: false });
    const off = scoreSpam(obvious, quiet, { spam: { enabled: false } });
    expect(off.spam).toBe(false);
    expect(off.score).toBeGreaterThan(0);
  });

  it("holds back at the project's own threshold", () => {
    const borderline = report({ description: "See https://a.example and https://b.example" });
    expect(scoreSpam(borderline, quiet, {}).spam).toBe(false);
    expect(scoreSpam(borderline, quiet, { spam: { threshold: 2 } }).spam).toBe(true);
  });
});

describe("blocked reporters", () => {
  const hash = keyedHash("198.51.100.4");

  it("blocks nobody by default", () => {
    expect(isBlocked({}, { ipHash: hash, email: "jo@example.com" })).toBe(false);
  });

  it("matches a hash copied from a report", () => {
    expect(isBlocked({ block: { ipHashes: [hash] } }, { ipHash: hash, email: null })).toBe(true);
  });

  it("hashes an address typed into the dashboard, because the stored one is keyed", () => {
    expect(isBlocked({ block: { ips: ["198.51.100.4"] } }, { ipHash: hash, email: null })).toBe(true);
    expect(isBlocked({ block: { ips: ["198.51.100.5"] } }, { ipHash: hash, email: null })).toBe(false);
  });

  it("matches an address or its domain, however it was typed", () => {
    expect(isBlocked({ block: { emails: ["Spammer@Example.com"] } }, { ipHash: "x", email: "spammer@example.com" })).toBe(true);
    expect(isBlocked({ block: { domains: ["@example.com"] } }, { ipHash: "x", email: "anyone@example.com" })).toBe(true);
    expect(isBlocked({ block: { domains: ["example.com"] } }, { ipHash: "x", email: "anyone@other.com" })).toBe(false);
  });
});

describe("throwaway addresses", () => {
  it("knows the usual ones and leaves everything else alone", () => {
    expect(isDisposable("someone@mailinator.com")).toBe(true);
    expect(isDisposable("SOMEONE@YOPMAIL.COM")).toBe(true);
    expect(isDisposable("someone@gmail.com")).toBe(false);
    expect(isDisposable("not an address")).toBe(false);
  });
});

describe("the hash that spots the same text again", () => {
  it("ignores case and spacing, because a run varies both", () => {
    expect(contentHashOf("Buy   now", "Cheap\nstuff")).toBe(contentHashOf("buy now", "cheap stuff"));
  });

  it("is different for different text", () => {
    expect(contentHashOf("One thing", "")).not.toBe(contentHashOf("Another thing", ""));
  });
});
