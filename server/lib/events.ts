import { sql } from "../db";

/**
 * Lightweight change notifications. Writers call publish(); Postgres
 * LISTEN/NOTIFY carries the event to every process, and subscribers (the
 * dashboard's server-sent event streams, the delivery worker) react
 * immediately instead of polling.
 */
export type AppEvent =
  | { type: "report.created" | "report.updated" | "report.deleted"; orgId: string; projectId: string; reportId: string }
  | { type: "delivery.updated"; orgId: string; projectId: string; reportId: string | null; deliveryId: string }
  | { type: "delivery.queued"; orgId: string }
  | { type: "email.queued"; orgId: string };

type Listener = (event: AppEvent) => void;
const listeners = new Set<Listener>();
let listening: Promise<unknown> | null = null;

const CHANNEL = "issueit_events";

export async function publish(event: AppEvent) {
  await sql.notify(CHANNEL, JSON.stringify(event));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!listening) {
    listening = sql.listen(CHANNEL, (payload) => {
      let event: AppEvent;
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      for (const l of listeners) l(event);
    });
  }
  return () => listeners.delete(listener);
}
