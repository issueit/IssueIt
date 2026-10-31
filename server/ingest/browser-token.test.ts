import { describe, expect, it, vi } from "vitest";
import { mintBrowserToken, readBrowserToken, MAX_TOKEN_SECONDS } from "./browser-token";

describe("short-lived browser tokens", () => {
  it("is good for the project it was minted for, and no other", () => {
    const { token } = mintBrowserToken("prj_abc", 300);
    expect(readBrowserToken(token)).toEqual({ projectId: "prj_abc" });
    const other = mintBrowserToken("prj_xyz", 300);
    expect(readBrowserToken(other.token)?.projectId).toBe("prj_xyz");
  });

  it("refuses one that has been tampered with", () => {
    const { token } = mintBrowserToken("prj_abc", 300);
    const [, body, signature] = token.split(".");
    // Swapping the project but keeping the signature must not work.
    expect(readBrowserToken(`it_prj_evil.${body}.${signature}`)).toBeNull();
    expect(readBrowserToken(`${token}x`)).toBeNull();
    expect(readBrowserToken("it_prj_abc.9999999999.deadbeef")).toBeNull();
  });

  it("refuses anything that isn't one", () => {
    expect(readBrowserToken("sk_live_whatever")).toBeNull();
    expect(readBrowserToken("it_")).toBeNull();
    expect(readBrowserToken("it_prj_abc.123")).toBeNull();
  });

  it("stops working on its own", () => {
    const { token, expiresAt } = mintBrowserToken("prj_abc", 60);
    expect(readBrowserToken(token)).not.toBeNull();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(expiresAt.getTime() + 1000));
      expect(readBrowserToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("can't be asked for a longer life than it's allowed", () => {
    const { expiresAt } = mintBrowserToken("prj_abc", 86_400);
    expect(Math.round((expiresAt.getTime() - Date.now()) / 1000)).toBeLessThanOrEqual(MAX_TOKEN_SECONDS);
    // Nor a uselessly short one. The floor is 30 seconds from the start of
    // the current second, so a little under 30 is still right.
    const brief = mintBrowserToken("prj_abc", 1);
    expect((brief.expiresAt.getTime() - Date.now()) / 1000).toBeGreaterThan(29);
  });
});
