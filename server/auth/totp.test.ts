import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newRecoveryCodes, newTotpSecret, otpauthUrl, totpNow, verifyTotp } from "./totp";

describe("two-factor codes", () => {
  it("round-trips base32", () => {
    const buffer = Buffer.from("issueit two factor");
    expect(base32Decode(base32Encode(buffer)).equals(buffer)).toBe(true);
  });

  it("agrees with RFC 6238's test vector", () => {
    // The RFC's shared secret is the ASCII "12345678901234567890".
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpNow(secret, 59_000)).toBe("287082");
    expect(totpNow(secret, 1_111_111_109_000)).toBe("081804");
  });

  it("accepts the code for now and the steps either side", () => {
    const secret = newTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpNow(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpNow(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpNow(secret, now + 30_000), now)).toBe(true);
    // Two steps away is too far: a code is good for about a minute and a half.
    expect(verifyTotp(secret, totpNow(secret, now + 90_000), now)).toBe(false);
  });

  it("refuses nonsense without throwing", () => {
    const secret = newTotpSecret();
    expect(verifyTotp(secret, "")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp("not base32!!", "123456")).toBe(false);
  });

  it("writes a URL an authenticator app can read", () => {
    const url = otpauthUrl("ABCDEFGH", "sam@example.com");
    expect(url).toContain("otpauth://totp/Issueit:sam%40example.com");
    expect(url).toContain("secret=ABCDEFGH");
    expect(url).toContain("period=30");
  });

  it("makes recovery codes that read aloud", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    // No l, i, o, 0 or 1, because they get written down and read back.
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
  });
});
