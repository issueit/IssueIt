import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IssueitClient, IssueitError, type ClientOptions } from "./client";
import { docs, openReports, projectResource, reportResource } from "./resources";
import { prompts } from "./prompts";
import { tools } from "./tools";

export const VERSION = "0.1.0";

/**
 * Builds the MCP server over one Issueit install. Tools, resources and
 * prompts are declared elsewhere; this only wires them up and makes sure a
 * failure comes back as something the model can act on.
 */
export function createServer(options: ClientOptions): McpServer {
  const client = new IssueitClient(options);
  const server = new McpServer(
    { name: "issueit", title: "Issueit", version: VERSION },
    {
      instructions: [
        "Issueit collects bug reports from a product and delivers them to trackers, chat and webhooks. It is not an issue tracker itself.",
        "Call whoami first: it says which organisation this token belongs to, which projects it can see, and which scopes it holds.",
        "get_report is the one that matters. A report carries the console errors, network requests and clicks captured in the moments before it was sent, which is usually enough to find the fault in the code.",
        "Resolve a report only once the fix is shipped: resolving emails the people who asked to hear about it.",
      ].join(" "),
    },
  );

  for (const t of tools) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.input, annotations: { title: t.title, ...t.annotations } },
      async (args: Record<string, unknown>) => {
        try {
          const result = await t.run(client, args ?? {});
          return {
            content: [{ type: "text" as const, text: result.text }],
            ...(result.data ? { structuredContent: result.data } : {}),
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: explain(err) }], isError: true };
        }
      },
    );
  }

  server.registerResource(
    "open-reports",
    "issueit://reports/open",
    { title: "Open bug reports", description: "Every report still to be dealt with, newest first.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: await openReports(client) }] }),
  );

  server.registerResource(
    "report",
    new ResourceTemplate("issueit://report/{id}", {
      list: async () => {
        const { reports } = await client.get<{ reports: Array<{ id: string; number: number; title: string; projectName: string }> }>("/reports?status=open&limit=50");
        return {
          resources: reports.map((r) => ({ uri: `issueit://report/${r.id}`, name: `${r.projectName} #${r.number}: ${r.title}`, mimeType: "text/markdown" })),
        };
      },
    }),
    { title: "A bug report", description: "One report in full, with the diagnostics captured when it was sent.", mimeType: "text/markdown" },
    async (uri, { id }) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: await reportResource(client, String(id)) }] }),
  );

  server.registerResource(
    "project",
    new ResourceTemplate("issueit://project/{id}", {
      list: async () => {
        const me = await client.whoami();
        return { resources: me.projects.map((p) => ({ uri: `issueit://project/${p.id}`, name: p.name, mimeType: "application/json" })) };
      },
    }),
    { title: "A project's settings", description: "Widget configuration, allowed sites, intake addresses and counts.", mimeType: "application/json" },
    async (uri, { id }) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: await projectResource(client, String(id)) }] }),
  );

  server.registerResource(
    "api-reference",
    docs.uri,
    { title: docs.name, description: docs.description, mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: docs.text() }] }),
  );

  for (const p of prompts) {
    server.registerPrompt(
      p.name,
      { title: p.title, description: p.description, argsSchema: p.args as Record<string, z.ZodType<string | undefined>> },
      (args: Record<string, string | undefined>) => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: p.build(args ?? {}) } }],
      }),
    );
  }

  return server;
}

/** A failure the model can do something about, rather than a stack trace. */
function explain(err: unknown): string {
  if (err instanceof IssueitError) {
    if (err.status === 401) return `${err.message} Check ISSUEIT_TOKEN, or create a new token in Settings › Account tokens.`;
    // Only add the scope hint when a scope is actually what was missing; a
    // 403 from the intake API is a different problem with its own advice.
    if (err.status === 403 && /scope/.test(err.message)) return `${err.message} A person has to widen this token in the dashboard.`;
    if (err.status === 429) return `${err.message} Wait rather than retrying straight away.`;
    return err.message;
  }
  return `Something went wrong: ${(err as Error)?.message ?? String(err)}`;
}
