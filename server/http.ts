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

export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const header = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (header) return header;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
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
