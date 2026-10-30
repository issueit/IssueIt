import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cleanFilename, sniff } from "./ingest/files";
import { checkUrlShape, isPrivateAddress } from "./lib/ssrf";
import { signPayload } from "./integrations/providers/webhook";
import { matchesRule } from "./delivery/queue";
import { markdownBody } from "./integrations/format";
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
  it("refuses local hosts and credentials in URLs", () => {
    expect(() => checkUrlShape("http://localhost/hook")).toThrow();
    expect(() => checkUrlShape("https://user:pass@example.com/")).toThrow();
    expect(() => checkUrlShape("ftp://example.com/")).toThrow();
    expect(checkUrlShape("https://example.com/hook").host).toBe("example.com");
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
