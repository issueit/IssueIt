import { serve } from "@hono/node-server";
import { config } from "./config";
import { runMigrations, sql } from "./db";
import { createApp } from "./app";
import { startWorker, stopWorker } from "./delivery/worker";
import { startSync, stopSync } from "./delivery/sync";
import { startMailWorker, stopMailWorker } from "./mail/outbox";

/**
 * One process by default (ROLE=all): the dashboard, the ingestion API and the
 * delivery worker. ROLE=api or ROLE=worker splits them when scale needs it.
 */
async function main() {
  await runMigrations();
  console.log("[db] migrations applied");

  if (config.role !== "worker") {
    const server = serve({ fetch: createApp().fetch, hostname: config.host, port: config.port }, (info) => {
      console.log(`[http] Issueit listening on ${info.address}:${info.port} - ${config.appUrl}`);
    });
    const shutdown = () => {
      stopWorker();
      stopMailWorker();
      stopSync();
      server.close(() => void sql.end({ timeout: 5 }).finally(() => process.exit(0)));
      setTimeout(() => process.exit(0), 8000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
  if (config.role !== "api") {
    startWorker();
    startMailWorker();
    startSync();
  }
}

main().catch((err) => {
  console.error("[startup]", err);
  process.exit(1);
});
