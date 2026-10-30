import type { Context } from "hono";
import { config } from "../config";
import type { OrgSettings } from "../db/schema";
import { timezoneCountry } from "./timezones";

/** Country headers set by common proxies and CDNs. Only read behind a trusted proxy. */
const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "fastly-geoip-country-code", "x-country-code"];

/**
 * Where a report came from, as an ISO 3166 alpha-2 code. Issueit doesn't look
 * up IP addresses: it trusts a proxy's country header when TRUST_PROXY is set,
 * then falls back to the reporter's time zone, which browsers send with the widget.
 */
export function reportCountry(c: Context, timezone: string | undefined, mode: OrgSettings["location"] = "auto"): string | null {
  if (mode === "off") return null;
  if (mode === "auto" && config.trustProxy) {
    for (const name of COUNTRY_HEADERS) {
      const value = c.req.header(name)?.trim().toUpperCase();
      // XX and T1 are Cloudflare's "unknown" and "Tor".
      if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
    }
  }
  return (timezone && timezoneCountry[timezone]) || null;
}
