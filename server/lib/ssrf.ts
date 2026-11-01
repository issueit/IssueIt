import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { config } from "../config";

/**
 * Outgoing requests to user-supplied URLs (webhooks, self-hosted GitLab)
 * go through here. The address is checked after DNS resolution and the
 * connection is pinned to the checked address, so a hostname cannot
 * resolve to something internal between the check and the connect.
 */

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const blockedV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/**
 * The sixteen bytes of an IPv6 address, or null if it isn't one. The textual
 * form can't be trusted to say what an address is: `new URL()` re-serialises
 * `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`, and every address has a long
 * form, so the ranges below are compared as numbers.
 */
export function ipv6ToBytes(ip: string): Uint8Array | null {
  let text = ip.toLowerCase();
  const pct = text.indexOf("%");
  if (pct !== -1) text = text.slice(0, pct);
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    if (colon === -1) return null;
    const quad = text.slice(colon + 1);
    if (!net.isIPv4(quad)) return null;
    const q = quad.split(".").map(Number);
    text = `${text.slice(0, colon + 1)}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const out = new Uint8Array(16);
  const write = (groups: string[], at: number) => {
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return false;
      const v = Number.parseInt(g, 16);
      out[at++] = v >> 8;
      out[at++] = v & 0xff;
    }
    return true;
  };
  if (!write(head, 0) || !write(tail, 16 - tail.length * 2)) return null;
  return out;
}

function inPrefix(addr: Uint8Array, prefix: Uint8Array, bits: number): boolean {
  const whole = bits >> 3;
  for (let i = 0; i < whole; i++) if (addr[i] !== prefix[i]) return false;
  const rest = bits & 7;
  if (!rest) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (addr[whole] & mask) === (prefix[whole] & mask);
}

const blockedV6: Array<[Uint8Array, number]> = (
  [
    ["::", 96], // unspecified, loopback and the deprecated IPv4-compatible range
    ["64:ff9b::", 96], // NAT64
    ["64:ff9b:1::", 48], // local-use NAT64
    ["100::", 64], // discard-only
    ["2001::", 32], // Teredo, which tunnels to an embedded IPv4 address
    ["2001:20::", 28], // ORCHIDv2
    ["2001:db8::", 32], // documentation
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["ff00::", 8], // multicast
  ] as Array<[string, number]>
).map(([text, bits]) => [ipv6ToBytes(text)!, bits]);

/** Ranges that carry an IPv4 address inside them: [prefix, bits, byte offset of the address]. */
const embeddedV4: Array<[Uint8Array, number, number]> = (
  [
    ["::ffff:0:0", 96, 12], // IPv4-mapped
    ["::ffff:0:0:0", 96, 12], // IPv4-translated
    ["2002::", 16, 2], // 6to4
  ] as Array<[string, number, number]>
).map(([text, bits, at]) => [ipv6ToBytes(text)!, bits, at]);

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return blockedV4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const addr = ipv6ToBytes(ip);
    if (!addr) return true;
    for (const [prefix, bits, at] of embeddedV4) {
      if (inPrefix(addr, prefix, bits)) return isPrivateAddress(`${addr[at]}.${addr[at + 1]}.${addr[at + 2]}.${addr[at + 3]}`);
    }
    return blockedV6.some(([prefix, bits]) => inPrefix(addr, prefix, bits));
  }
  return true;
}

export class UnsafeUrlError extends Error {}

export function checkUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Enter a full URL starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http and https URLs are supported.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs can't include a username or password.");
  if (!config.webhookAllowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
      throw new UnsafeUrlError("Local and internal addresses aren't allowed.");
    if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Private network addresses aren't allowed.");
  }
  return url;
}

const guardedAgent = new Agent({
  connect: {
    timeout: 10_000,
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = (Array.isArray(addresses) ? addresses : [addresses]) as dns.LookupAddress[];
        const safe = config.webhookAllowPrivate ? list : list.filter((a) => !isPrivateAddress(a.address));
        if (!safe.length) return callback(new UnsafeUrlError("That address resolves to a private network."), "", 4);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, safe);
        callback(null, safe[0].address, safe[0].family);
      });
    },
  },
});

export type SafeResponse = { status: number; ok: boolean; headers: Headers; text: string };

/** POST/GET to an untrusted URL. Never follows redirects; reads at most 64 KB of the body. */
export async function safeFetch(rawUrl: string, init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}): Promise<SafeResponse> {
  const url = checkUrlShape(rawUrl);
  const res = await undiciFetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
    redirect: "manual",
    dispatcher: guardedAgent,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await readLimited(res.body as ReadableStream<Uint8Array> | null, 64 * 1024);
  return { status: res.status, ok: res.ok, headers: res.headers as unknown as Headers, text };
}

async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, max).toString("utf8");
}
