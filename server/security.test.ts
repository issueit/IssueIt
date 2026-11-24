import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanFilename, sniff } from "./ingest/files";
import { checkUrlShape, isPrivateAddress } from "./lib/ssrf";
import { hostName } from "./integrations/catalogue/define";
import { signPayload } from "./integrations/providers/webhook";
import { matchesRule } from "./delivery/queue";
import { markdownBody } from "./integrations/format";
import { compilePatterns, scrubLink } from "./lib/scrub";
import { safeLink } from "../shared/scrub";
import { addressFromHeader, httpUrl } from "./http";
import { testReport } from "./delivery/payload";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("attachment sniffing", () => {
  it("recognises images by their bytes, not their name", () => {
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.contentType).toBe("image/png");
    expect(sniff(bytes(0xff, 0xd8, 0xff))?.contentType).toBe("image/jpeg");
  });
  it("accepts plain text and refuses markup that could run script", () => {
    expect(sniff(new TextEncoder().encode("steps:\n1. open\n"))?.contentType).toBe("text/plain");
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniff(new TextEncoder().encode("<!doctype html><script>"))).toBeNull();
    expect(sniff(bytes(0x00, 0x01, 0x02, 0x7f))).toBeNull();
  });
  it("cleans filenames and never lets a path through", () => {
    expect(cleanFilename("../../etc/passwd", "txt")).toBe("passwd.txt");
    expect(cleanFilename("..\\..\\boot.ini", "txt")).toBe("boot.ini");
    expect(cleanFilename(undefined, "png")).toBe("attachment.png");
    expect(cleanFilename("screen shot.png", "png")).toBe("screen shot.png");
  });
});

describe("SSRF guard", () => {
  it("treats internal ranges as private", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.0.62", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.96.26.101"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("140.82.112.3")).toBe(false);
  });
  it("sees through every spelling of an IPv4-mapped address", () => {
    // `new URL()` re-serialises the dotted form as hex, so a check on the
    // text of the address missed all of these.
    for (const ip of [
      "::ffff:7f00:1",
      "::ffff:127.0.0.1",
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:7f00:1",
      "0000:0000:0000:0000:0000:ffff:7f00:0001",
      "::FFFF:7F00:1",
      "::ffff:0:7f00:1",
      "::ffff:0:10.0.0.1",
      "::7f00:1",
      "2002:7f00:1::",
      "2002:a9fe:a9fe::",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("still allows a public address written as IPv6", () => {
    for (const ip of ["::ffff:140.82.112.3", "::ffff:8c52:7003", "2002:8c52:7003::", "2606:4700:4700::1111", "2a00:1450:4001:810::200e"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("blocks the IPv6 ranges nothing public lives in", () => {
    for (const ip of ["::", "::1", "0:0:0:0:0:0:0:1", "fe80::1", "febf::1", "fc00::1", "fd12:3456::1", "ff02::1", "64:ff9b::7f00:1", "100::1", "2001::1", "2001:db8::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("calls anything it cannot parse private", () => {
    for (const ip of ["", "not-an-ip", "1.2.3", "::ffff:1.2.3.999", "1:2:3:4:5:6:7:8:9", "::1::2"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("refuses local hosts and credentials in URLs", () => {
    expect(() => checkUrlShape("http://localhost/hook")).toThrow();
    expect(() => checkUrlShape("http://localhost./hook")).toThrow();
    expect(() => checkUrlShape("https://user:pass@example.com/")).toThrow();
    expect(() => checkUrlShape("ftp://example.com/")).toThrow();
    expect(checkUrlShape("https://example.com/hook").host).toBe("example.com");
  });
  it("refuses an IPv6 literal that points back at the host", () => {
    for (const url of ["http://[::1]/hook", "http://[0:0:0:0:0:0:0:1]/hook", "http://[::ffff:127.0.0.1]/hook", "http://[::ffff:169.254.169.254]/hook", "http://[2002:7f00:1::]/hook"]) {
      expect(() => checkUrlShape(url), url).toThrow(/Private network/);
    }
    expect(checkUrlShape("https://[2606:4700:4700::1111]/hook").host).toBe("[2606:4700:4700::1111]");
  });
});

describe("provider host fields", () => {
  it("falls back when the field is empty", () => {
    expect(hostName(undefined, "api.mailgun.net")).toBe("api.mailgun.net");
    expect(hostName("  ", "api.mailgun.net")).toBe("api.mailgun.net");
  });
  it("accepts the host names these fields exist for", () => {
    expect(hostName("api.eu.mailgun.net", "api.mailgun.net")).toBe("api.eu.mailgun.net");
    expect(hostName("API.Smartsheet.EU", "api.smartsheet.com")).toBe("api.smartsheet.eu");
    expect(hostName("datadoghq.eu", "datadoghq.com")).toBe("datadoghq.eu");
  });
  it("refuses anything that would move the request somewhere else", () => {
    // These land in the authority of a template, so a path, scheme, port or
    // fragment in one sends the request — and the credentials — elsewhere.
    for (const value of [
      "attacker.example/x#",
      "attacker.example#",
      "attacker.example?x=1",
      "https://attacker.example",
      "attacker.example:8443",
      "user@attacker.example",
      "api.mailgun.net/../..",
      "localhost",
      "127.0.0.1",
      "[::1]",
      "api mailgun net",
      "-api.mailgun.net",
      "api..mailgun.net",
    ]) {
      expect(() => hostName(value, "api.mailgun.net"), value).toThrow(/host name on its own/);
    }
  });
});

describe("webhook signatures", () => {
  it("signs timestamp and body so receivers can verify both", () => {
    const header = signPayload("whsec_test", '{"a":1}', 1700000000);
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });
});

describe("routing rules", () => {
  const report = { priority: "high" as const, source: "widget", environment: "production" };
  it("sends everything when the rule is empty", () => expect(matchesRule({}, report)).toBe(true));
  it("filters by priority, source and environment", () => {
    expect(matchesRule({ priorities: ["critical"] }, report)).toBe(false);
    expect(matchesRule({ priorities: ["critical", "high"], sources: ["widget"] }, report)).toBe(true);
    expect(matchesRule({ environments: ["staging"] }, report)).toBe(false);
  });
  it("keeps channels apart: a destination in a channel takes only its posts", () => {
    const shop = { ...report, channel: "shop" };
    // No channel on the destination: only what was sent to no channel.
    expect(matchesRule({}, shop)).toBe(false);
    expect(matchesRule({}, { ...report, channel: null })).toBe(true);
    // In a channel: only that channel's posts, never the default ones.
    expect(matchesRule({ channels: ["shop"] }, shop)).toBe(true);
    expect(matchesRule({ channels: ["shop", "admin"] }, { ...report, channel: "admin" })).toBe(true);
    expect(matchesRule({ channels: ["shop"] }, report)).toBe(false);
    expect(matchesRule({ channels: ["admin"] }, shop)).toBe(false);
    // The other filters still apply inside a channel.
    expect(matchesRule({ channels: ["shop"], priorities: ["low"] }, shop)).toBe(false);
  });
});

describe("report formatting", () => {
  it("includes the facts and a link back, and escapes table cells", () => {
    const r = { ...testReport({ id: "prj_x", name: "Web | App" }), pageUrl: "https://example.com/a|b" };
    const md = markdownBody(r);
    expect(md).toContain("| Priority | Medium |");
    expect(md).toContain("Web \\| App");
    expect(md).toContain("https://example.com/a\\|b");
    expect(md).toContain("Reported through [Issueit]");
  });
});

describe("links that become an href", () => {
  it("refuses the schemes a browser would run", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>x</script>", "vbscript:x", "not a url"]) {
      expect(safeLink(bad), bad).toBeNull();
      expect(httpUrl(2000).safeParse(bad).success, bad).toBe(false);
    }
  });
  it("accepts the two a browser can follow", () => {
    expect(safeLink("https://example.com/login?a=1")).toBe("https://example.com/login?a=1");
    expect(safeLink("http://localhost:3000/checkout")).toBe("http://localhost:3000/checkout");
    expect(httpUrl(2000).safeParse("https://example.com/login").success).toBe(true);
  });
});

describe("the address a report came from", () => {
  it("keeps the page, because that is what the report is about", () => {
    expect(scrubLink("https://shop.example.com/orders/4821/edit?tab=items")).toBe("https://shop.example.com/orders/4821/edit?tab=items");
    // An id is what makes the page findable again; a UUID is an id, not a secret.
    expect(scrubLink("https://app.example.com/r/550e8400-e29b-41d4-a716-446655440000")).toBe("https://app.example.com/r/550e8400-e29b-41d4-a716-446655440000");
  });
  it("takes out what a query string or a fragment can be carrying", () => {
    expect(scrubLink("https://app.example.com/reset?token=s3cretvalue&next=/home")).toBe("https://app.example.com/reset?token=[redacted]&next=/home");
    // Single sign-on hands tokens back in the fragment, where no server would ever see them.
    expect(scrubLink("https://app.example.com/cb#access_token=abc123&expires_in=3600")).toBe("https://app.example.com/cb#access_token=[redacted]&expires_in=3600");
    expect(scrubLink("https://app.example.com/invite?email=someone@example.com")).toBe("https://app.example.com/invite?email=[redacted]");
  });
  it("takes out a long opaque path segment, which is how a reset link is built", () => {
    // 32 characters is where "opaque" starts, so a slug or a short id keeps its own name.
    expect(scrubLink("https://app.example.com/magic/d41d8cd98f00b204e9800998ecf8427e9f1b2c3d")).toBe("https://app.example.com/magic/[redacted]");
    expect(scrubLink("https://app.example.com/blog/the-one-about-widgets")).toBe("https://app.example.com/blog/the-one-about-widgets");
  });
  it("keeps a hash route, which is the page on plenty of sites", () => {
    expect(scrubLink("https://app.example.com/#/settings/billing")).toBe("https://app.example.com/#/settings/billing");
  });
  it("applies the project's own patterns too", () => {
    const extra = compilePatterns([{ pattern: "acct-\\d+", label: "account" }]);
    expect(scrubLink("https://app.example.com/a/acct-99012/invoices", 2000, extra)).toBe("https://app.example.com/a/[account]/invoices");
  });
});

/**
 * The address every per-address limit is keyed on. A caller can put anything
 * in the header, so what matters is which entry is believed.
 */
describe("the caller's address behind a proxy", () => {
  it("takes the entry the single proxy in front appended, not the one the caller sent", () => {
    // A caller sending "x-forwarded-for: 1.2.3.4" arrives looking like this.
    expect(addressFromHeader("1.2.3.4, 198.51.100.7", 1)).toBe("198.51.100.7");
  });

  it("counts back through a chain of its own", () => {
    expect(addressFromHeader("1.2.3.4, 198.51.100.7, 10.0.0.1", 2)).toBe("198.51.100.7");
    expect(addressFromHeader("spoofed, spoofed, 198.51.100.7, 10.0.0.1, 10.0.0.2", 3)).toBe("198.51.100.7");
  });

  it("can't be pushed off the end by a caller sending a longer list", () => {
    // However many entries are forged, the one the proxy added is still last.
    expect(addressFromHeader("a, b, c, d, e, f, g, 198.51.100.7", 1)).toBe("198.51.100.7");
  });

  it("falls back to the leftmost when the chain is shorter than configured", () => {
    expect(addressFromHeader("198.51.100.7", 3)).toBe("198.51.100.7");
  });

  it("ignores spacing and empty entries, and has nothing to say without a header", () => {
    expect(addressFromHeader("  1.2.3.4 ,, 198.51.100.7  ", 1)).toBe("198.51.100.7");
    expect(addressFromHeader(undefined, 1)).toBe(null);
    expect(addressFromHeader("", 1)).toBe(null);
    expect(addressFromHeader(" , ", 1)).toBe(null);
  });
});
