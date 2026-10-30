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

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return blockedV4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower) || lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8");
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
    const host = url.hostname.replace(/^\[|\]$/g, "");
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
