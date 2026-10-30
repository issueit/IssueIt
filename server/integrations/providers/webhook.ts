import { createHmac } from "node:crypto";
import { webhookEvents } from "../../db/schema";
import { IntegrationError, request } from "../http";
import type { Provider } from "../types";

/**
 * Signature: `Issueit-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`,
 * keyed with the destination's signing secret. Receivers recompute it over
 * the raw body and reject timestamps older than five minutes.
 */
export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export const webhook: Provider = {
  id: "webhook",
  name: "Webhook",
  kind: "webhook",
  category: "webhook",
  summary: "Sends signed JSON events to a URL you control.",
  targetLabel: null,
  events: webhookEvents,
  async deliver({ secrets, payload, deliveryId, event }) {
    if (!secrets?.url || !secrets.signingSecret || !payload)
      throw new IntegrationError("This webhook is missing its URL or signing secret. Edit it and save again.", { retryable: false });
    const body = JSON.stringify(payload);
    // Extra headers set in the destination's settings, e.g. an auth token. Issueit's own headers win.
    const extra = (secrets as unknown as { headers?: Record<string, string> }).headers ?? {};
    try {
      const { status } = await request("Your endpoint", secrets.url, {
        method: "POST",
        untrusted: true,
        body,
        timeoutMs: 15_000,
        thing: "URL",
        headers: {
          ...extra,
          "content-type": "application/json",
          "issueit-event": event,
          "issueit-delivery": deliveryId,
          "issueit-signature": signPayload(secrets.signingSecret, body),
        },
      });
      return { responseStatus: status };
    } catch (err) {
      // Receivers often return 4xx while they're being deployed; only a 410 means "stop".
      if (err instanceof IntegrationError && err.status && err.status !== 410 && [400, 401, 403, 404, 408, 409, 423, 425].includes(err.status)) {
        err.retryable = true;
        err.reconnect = false;
        err.message = `The endpoint responded with ${err.status}. Issueit will try again.`;
      }
      throw err;
    }
  },
};
