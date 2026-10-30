import { Hono } from "hono";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { encryptJson, randomToken } from "../lib/crypto";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { body, type AppEnv } from "../http";
import { requireUser } from "../auth/session";
import { IntegrationError, request } from "./http";
import { getProvider, oauthAvailable } from "./index";
import { trelloAccount } from "./providers/trello";
import type { ConnectResult, Provider } from "./types";

/**
 * OAuth: the dashboard asks for an authorise URL, the provider sends the
 * person back to /api/oauth/:provider/callback, and the connection is saved
 * to the organisation that started the flow. Trello has its own token flow,
 * finished by the dashboard posting the token from the URL fragment.
 */

export const redirectUri = (provider: string) => `${config.appUrl}/api/oauth/${provider}/callback`;

const STATE_MINUTES = 15;

export async function exchangeToken(provider: Provider, params: Record<string, string>): Promise<Record<string, unknown>> {
  const spec = provider.oauth!;
  const clientId = spec.clientId()!;
  const clientSecret = spec.clientSecret()!;
  const mode = spec.tokenRequest ?? "form";
  const url = spec.tokenUrl();
  let res;
  if (mode === "query") {
    res = await request(provider.name, `${url}?${new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params })}`, { method: "POST" });
  } else if (mode === "basic-json") {
    res = await request(provider.name, url, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      json: params,
    });
  } else {
    const full = { client_id: clientId, client_secret: clientSecret, ...params };
    res = await request(provider.name, url, { method: "POST", ...(mode === "json" ? { json: full } : { form: full }) });
  }
  const data = res.data as Record<string, unknown>;
  // Some providers (GitHub) report failures as 200 with an error field.
  if (data?.error && !data.access_token) {
    throw new IntegrationError(`${provider.name} didn't complete the connection (${String(data.error_description ?? data.error)}).`, { retryable: false });
  }
  return data;
}

/** Saves a new connection, or refreshes the credentials of an existing one for the same account. */
export async function saveConnection(orgId: string, userId: string, provider: Provider, result: ConnectResult, authType: "oauth" | "token") {
  const existing = await db.query.connections.findFirst({
    where: and(eq(schema.connections.orgId, orgId), eq(schema.connections.provider, provider.id), sql`${schema.connections.account}->>'label' = ${result.account.label}`),
  });
  if (existing) {
    await db
      .update(schema.connections)
      .set({ credentials: encryptJson(result.credentials), account: result.account, authType, status: "active", lastError: null, updatedAt: new Date() })
      .where(eq(schema.connections.id, existing.id));
    return existing.id;
  }
  const id = newId("con");
  await db.insert(schema.connections).values({
    id,
    orgId,
    provider: provider.id,
    authType,
    credentials: encryptJson(result.credentials),
    account: result.account,
    createdBy: userId,
  });
  return id;
}

const safeReturn = (value: string | undefined) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/projects");

function withParams(path: string, params: Record<string, string>) {
  const url = new URL(path, config.appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

/** Mounted under /api/orgs/:org/integrations. */
export async function startAuthorisation(orgId: string, userId: string, providerId: string, returnTo: string | undefined) {
  const provider = getProvider(providerId);
  if (!provider || !oauthAvailable(provider)) throw badRequest("Connecting with a sign-in isn't set up for this service on this server.");
  const state = randomToken(24);
  await db.delete(schema.oauthStates).where(lt(schema.oauthStates.expiresAt, new Date()));
  await db.insert(schema.oauthStates).values({
    id: state,
    orgId,
    userId,
    provider: provider.id,
    returnTo: safeReturn(returnTo),
    expiresAt: new Date(Date.now() + STATE_MINUTES * 60_000),
  });

  if (provider.id === "trello") {
    const params = new URLSearchParams({
      expiration: "never",
      name: "Issueit",
      scope: "read,write",
      response_type: "token",
      key: config.oauth.trello.apiKey!,
      callback_method: "fragment",
      return_url: `${config.appUrl}/oauth/trello?state=${state}`,
    });
    return `https://trello.com/1/authorize?${params}`;
  }

  const spec = provider.oauth!;
  const params = new URLSearchParams({
    client_id: spec.clientId()!,
    redirect_uri: redirectUri(provider.id),
    response_type: "code",
    state,
    ...spec.extraParams,
  });
  if (spec.scopes.length) params.set("scope", spec.scopes.join(spec.scopeSeparator ?? " "));
  return `${spec.authorizeUrl()}?${params}`;
}

async function takeState(state: string | undefined, userId: string, providerId: string) {
  if (!state) throw badRequest("The sign-in link was incomplete. Start connecting again.");
  const [row] = await db.delete(schema.oauthStates).where(eq(schema.oauthStates.id, state)).returning();
  if (!row || row.userId !== userId || row.provider !== providerId || row.expiresAt < new Date()) {
    throw badRequest("That sign-in took too long or was started elsewhere. Start connecting again.");
  }
  // The person may have left the organisation while they were away.
  const member = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, row.orgId), eq(schema.memberships.userId, userId)),
  });
  if (!member) throw notFound("That organisation");
  return row;
}

const describe = (err: unknown) =>
  err instanceof IntegrationError || (err instanceof Error && "status" in err) ? (err as Error).message : "Couldn't finish connecting. Try again.";

export const oauthRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/:provider/callback", async (c) => {
    const provider = getProvider(c.req.param("provider"));
    if (!provider?.oauth) throw notFound("That service");
    const user = c.get("user");
    let returnTo = "/projects";
    try {
      const state = await takeState(c.req.query("state"), user.id, provider.id);
      returnTo = state.returnTo;
      const denied = c.req.query("error");
      if (denied) throw new IntegrationError(denied === "access_denied" ? "The connection was cancelled." : `${provider.name} didn't complete the connection.`, { retryable: false });
      const code = c.req.query("code");
      if (!code) throw new IntegrationError(`${provider.name} didn't send an authorisation code.`, { retryable: false });
      const token = await exchangeToken(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri(provider.id) });
      const result = await provider.oauth.complete(token);
      const id = await saveConnection(state.orgId, user.id, provider, result, "oauth");
      return c.redirect(withParams(returnTo, { connected: id, provider: provider.id }));
    } catch (err) {
      if (!(err instanceof IntegrationError)) console.error("[oauth]", provider.id, err);
      return c.redirect(withParams(returnTo, { connectError: describe(err), provider: provider.id }));
    }
  })
  .post("/trello/complete", async (c) => {
    const input = await body(c, z.object({ state: z.string().min(1), token: z.string().regex(/^[A-Za-z0-9]{32,128}$/, "That Trello token isn't valid.") }));
    const user = c.get("user");
    const state = await takeState(input.state, user.id, "trello");
    const credentials = { accessToken: input.token };
    const account = await trelloAccount(credentials);
    const id = await saveConnection(state.orgId, user.id, getProvider("trello")!, { credentials, account }, "oauth");
    return c.json({ id, returnTo: withParams(state.returnTo, { connected: id, provider: "trello" }) });
  });
