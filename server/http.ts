import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { z } from "zod";
import { config } from "./config";
import { badRequest } from "./lib/errors";
import type { schema } from "./db";
import type { Scope } from "./db/schema";

export type SessionUser = typeof schema.users.$inferSelect;
export type RequestOrg = typeof schema.organisations.$inferSelect;

/** An account token, when the request carried one instead of a session cookie. */
export type RequestToken = {
  id: string;
  scopes: Scope[];
  /** Null means every project in the organisation. */
  projectIds: string[] | null;
};

export type AppEnv = {
  Variables: {
    user: SessionUser;
    sessionId: string;
    orgId: string;
    /** The organisation itself, so anything can ask what its plan allows. */
    org: RequestOrg;
    role: "owner" | "member";
    /** How the request was authenticated. */
    via: "session" | "token";
    /** Set only for token requests. Its absence means a person in the dashboard. */
    token?: RequestToken;
  };
};

/**
 * The address the request really came from.
 *
 * Behind a proxy this has to be read from a header, and a caller can put
 * whatever it likes in that header: `x-forwarded-for: 1.2.3.4` arrives
 * looking exactly like the truth. Proxies append, so the entries a caller
 * forged sit on the left and the ones added by the proxies in front of
 * Issueit sit on the right. Counting from the right by the number of proxies
 * that are actually there is the only way to land on an address the caller
 * couldn't choose — and a per-address rate limit that a caller can choose is
 * no limit at all.
 */
export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const mine = addressFromHeader(c.req.header(config.proxyHeader), config.proxyHops);
    if (mine) return mine;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * The n-th entry from the right, where n is how many proxies stand in front
 * of Issueit. Fewer entries than that means the chain is shorter than
 * configured, so the leftmost is as far back as anyone can vouch for.
 */
export function addressFromHeader(raw: string | undefined, hops: number): string | null {
  if (!raw) return null;
  const chain = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[Math.max(chain.length - Math.max(hops, 1), 0)] ?? null;
}

/** Parses a JSON body with a zod schema and turns failures into a readable 400. */
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("The request body must be valid JSON.");
  }
  return parse(schema, raw);
}

export function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join(".");
    throw badRequest(field ? `${field}: ${issue.message}` : (issue?.message ?? "Invalid request."), {
      fields: Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message])),
    });
  }
  return result.data;
}

/**
 * A link that something will eventually render as an href. "javascript:…"
 * and "data:…" are valid URLs by the spec, and z.url() accepts them, so a
 * shape check alone would let one through to be clicked in the dashboard.
 * Only the two schemes a browser can safely follow are allowed.
 */
export const httpUrl = (max: number, message = "Use a full URL starting with http:// or https://.") =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => {
      try {
        return /^https?:$/.test(new URL(value).protocol);
      } catch {
        return false;
      }
    }, message);
