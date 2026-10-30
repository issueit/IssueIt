import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptJson, encryptJson } from "../lib/crypto";
import { notFound } from "../lib/errors";
import { IntegrationError } from "./http";
import { getProvider } from "./index";
import { exchangeToken } from "./oauth";
import type { ConnectionHandle, Credentials } from "./types";

type ConnectionRow = typeof schema.connections.$inferSelect;

/** Wraps a stored connection so providers can ask for a token without caring how it's refreshed. */
export function handleFor(row: ConnectionRow): ConnectionHandle {
  const credentials = decryptJson<Credentials>(row.credentials);
  const handle: ConnectionHandle = {
    id: row.id,
    account: row.account,
    credentials,
    async accessToken() {
      const expiring = credentials.expiresAt && credentials.expiresAt - Date.now() < 60_000;
      if (expiring && credentials.refreshToken) await refresh(row, credentials);
      if (!credentials.accessToken) throw new IntegrationError("This connection has no token. Reconnect the account.", { retryable: false, reconnect: true });
      return credentials.accessToken;
    },
  };
  return handle;
}

/** Refreshes in place and saves. Providers that rotate refresh tokens (Jira, GitLab) get the new one stored. */
async function refresh(row: ConnectionRow, credentials: Credentials) {
  const provider = getProvider(row.provider);
  if (!provider?.oauth) return;
  let token: Record<string, unknown>;
  try {
    token = await exchangeToken(provider, { grant_type: "refresh_token", refresh_token: String(credentials.refreshToken) });
  } catch (err) {
    if (err instanceof IntegrationError && !err.retryable) {
      await markConnection(row.id, "error", "The account's access expired and couldn't be renewed. Reconnect it.");
      throw new IntegrationError("The account's access expired and couldn't be renewed. Reconnect it.", { retryable: false, reconnect: true });
    }
    throw err;
  }
  credentials.accessToken = String(token.access_token);
  if (token.refresh_token) credentials.refreshToken = String(token.refresh_token);
  credentials.expiresAt = token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : undefined;
  await db
    .update(schema.connections)
    .set({ credentials: encryptJson(credentials), updatedAt: new Date() })
    .where(eq(schema.connections.id, row.id));
}

export async function markConnection(id: string, status: "active" | "error", lastError: string | null = null) {
  await db.update(schema.connections).set({ status, lastError, updatedAt: new Date() }).where(eq(schema.connections.id, id));
}

/** Loads a connection that must belong to the given organisation. */
export async function loadConnection(orgId: string, id: string) {
  const row = await db.query.connections.findFirst({ where: and(eq(schema.connections.id, id), eq(schema.connections.orgId, orgId)) });
  if (!row) throw notFound("That connection");
  return row;
}
