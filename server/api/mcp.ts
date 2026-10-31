import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../../mcp/src/server";
import { config } from "../config";
import { TOKEN_PREFIX } from "../auth/tokens";

/**
 * Issueit's own MCP endpoint, so an agent that speaks the protocol over HTTP
 * can connect with a URL and an account token, without installing anything.
 *
 * The tools are the same ones the published @issueit/mcp package offers; they
 * are given a dispatcher that calls straight into this app's router rather
 * than making HTTP requests back to ourselves, so authentication, scopes,
 * rate limits and the audit trail all behave exactly as they would for any
 * other caller.
 *
 * Each request builds its own stateless server, so nothing is held between
 * calls and two agents can never see each other's state.
 */
export function mcpEndpoint(dispatch: (req: Request) => Promise<Response>) {
  const routes = new Hono();

  routes.all("/", async (c) => {
    const token = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token?.startsWith(TOKEN_PREFIX)) {
      c.header("www-authenticate", `Bearer realm="Issueit", error="invalid_token"`);
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: `Send an Issueit account token as "Authorization: Bearer ${TOKEN_PREFIX}…". Create one in Settings › Account tokens.` },
          id: null,
        },
        401,
      );
    }

    // Keep the caller's address visible to rate limits and the audit trail.
    const forwarded: Record<string, string> = {};
    for (const header of ["cf-connecting-ip", "x-forwarded-for"]) {
      const value = c.req.header(header);
      if (value) forwarded[header] = value;
    }

    const server = createServer({
      baseUrl: config.appUrl,
      token,
      fetch: (url, init) => {
        const path = new URL(url, config.appUrl);
        const headers = new Headers(init.headers);
        for (const [k, v] of Object.entries(forwarded)) headers.set(k, v);
        return dispatch(new Request(`${config.appUrl}${path.pathname}${path.search}`, { ...init, headers }));
      },
    });

    // Stateless, and plain JSON rather than an event stream: one request in,
    // one response out, nothing left running between calls.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close().catch(() => {});
    }
  });

  return routes;
}
