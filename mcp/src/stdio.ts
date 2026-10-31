#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, VERSION } from "./server";

/**
 * The Issueit MCP server, spoken over stdin and stdout. Configuration is
 * environment only, because that is what MCP clients can set:
 *
 *   ISSUEIT_TOKEN       required, an account token (ak_live_…)
 *   ISSUEIT_URL         where Issueit lives; defaults to the hosted service
 *   ISSUEIT_INGEST_KEY  optional project secret key, for filing reports into
 *                       a project that refuses anonymous ones
 */

const HOSTED = "https://dash.issueit.app";

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }

  const token = process.env.ISSUEIT_TOKEN?.trim();
  if (!token) {
    // stderr, because stdout is the protocol channel.
    process.stderr.write("issueit-mcp: set ISSUEIT_TOKEN to an account token (ak_live_…). Create one in Settings › Account tokens.\n");
    process.exit(2);
  }
  if (!token.startsWith("ak_live_")) {
    process.stderr.write(
      token.startsWith("sk_live_")
        ? "issueit-mcp: that is a project secret key, which can only send reports. ISSUEIT_TOKEN needs an account token (ak_live_…).\n"
        : "issueit-mcp: ISSUEIT_TOKEN doesn't look like an account token (ak_live_…).\n",
    );
    process.exit(2);
  }

  const baseUrl = (process.env.ISSUEIT_URL?.trim() || HOSTED).replace(/\/+$/, "");
  const server = createServer({ baseUrl, token, ingestKey: process.env.ISSUEIT_INGEST_KEY?.trim() || undefined });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const stop = async () => {
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const HELP = `issueit-mcp ${VERSION}

The Issueit MCP server: read bug reports with the diagnostics captured when
they were sent, fix them, and mark them done.

Environment:
  ISSUEIT_TOKEN       an account token (ak_live_…), required
  ISSUEIT_URL         your Issueit, if you host it yourself
  ISSUEIT_INGEST_KEY  a project secret key, only to file reports into a
                      project that refuses anonymous ones

Add it to a client:
  claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp
`;

main().catch((err) => {
  process.stderr.write(`issueit-mcp: ${err?.stack ?? err}\n`);
  process.exit(1);
});
