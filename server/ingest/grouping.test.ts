import { describe, expect, it } from "vitest";
import { fingerprintFor, isMilestone, normalisePath, normaliseTitle } from "./grouping";
import { scrubText, scrubUrl } from "../lib/scrub";

describe("duplicate fingerprints", () => {
  it("ignores case, punctuation and numbers in titles", () => {
    expect(normaliseTitle("Error #4012 on SAVE!")).toBe("error on save");
    expect(normaliseTitle("  error 77 on save ")).toBe("error on save");
  });

  it("keeps HTTP status codes apart", () => {
    expect(normaliseTitle("Error 500 on checkout")).not.toBe(normaliseTitle("Error 404 on checkout"));
    expect(normaliseTitle("Order 4412 failed")).toBe(normaliseTitle("Order 87 failed"));
  });

  it("folds ids in paths and drops the query", () => {
    expect(normalisePath("https://App.example.com/orders/8812/edit?tab=2#x")).toBe("app.example.com/orders/:id/edit");
    expect(normalisePath("https://app.example.com/orders/91/edit")).toBe("app.example.com/orders/:id/edit");
    expect(normalisePath("not a url")).toBe("");
  });

  it("matches the same bug on the same page, and not on another", () => {
    const a = fingerprintFor({ title: "Checkout button does nothing", pageUrl: "https://shop.test/cart/12" });
    const b = fingerprintFor({ title: "checkout button does nothing.", pageUrl: "https://shop.test/cart/98?ref=mail" });
    const c = fingerprintFor({ title: "Checkout button does nothing", pageUrl: "https://shop.test/account" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("prefers a caller's own fingerprint", () => {
    const a = fingerprintFor({ fingerprint: "TypeError:cart.ts:41", title: "One", pageUrl: null });
    const b = fingerprintFor({ fingerprint: "TypeError:cart.ts:41", title: "Two", pageUrl: "https://x.test/" });
    expect(a).toBe(b);
    expect(a?.startsWith("x:")).toBe(true);
  });

  it("doesn't group titles with nothing to compare", () => {
    expect(fingerprintFor({ title: "!!!", pageUrl: null })).toBeNull();
    expect(fingerprintFor({ title: "42", pageUrl: null })).toBeNull();
  });

  it("comments on trackers at a few group sizes only", () => {
    expect([1, 2, 3, 4, 5, 6, 10, 11, 25, 1000, 1500, 2000].map(isMilestone)).toEqual([false, true, true, false, true, false, true, false, true, true, false, true]);
  });
});

describe("scrubbing", () => {
  it("removes emails, tokens and card numbers", () => {
    // The key here is deliberately not shaped like any real provider's: secret
    // scanners block pushes that contain one, even an obviously fake one.
    const out = scrubText("user ada@example.com sent Bearer abc.def.ghi1234 card 4242 4242 4242 4242 key demo_0123456789abcdef0123456789abcdef");
    expect(out).not.toContain("ada@example.com");
    expect(out).not.toContain("abc.def.ghi1234");
    expect(out).not.toContain("4242 4242");
    expect(out).not.toContain("0123456789abcdef0123456789abcdef");
  });

  it("catches camelCase and header-style secret names", () => {
    const out = scrubText('{"refreshToken":"abc123def456","sessionId":"s3ss10n","x-api-key: k3yk3y", "authentication failed for user"}');
    expect(out).not.toMatch(/abc123def456|s3ss10n|k3yk3y/);
    expect(out).toContain("authentication failed for user");
  });

  it("keeps query names but not values", () => {
    expect(scrubUrl("https://api.test/v1/orders?token=secret&page=2")).toBe("https://api.test/v1/orders?token=…&page=…");
    expect(scrubUrl("/api/me?x=1")).toBe("/api/me?x=…");
  });
});
