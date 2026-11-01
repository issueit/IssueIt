import { z } from "zod";
import { billingRoutes, billingWebhook, endLapsedTrials, warnAboutTrials } from "./api/billing";
import type { ApiDoc } from "./api/openapi";

/**
 * What the hosted service adds to this server, and nothing else does.
 *
 * Issueit is one codebase and two editions. Everything that makes a report
 * arrive, be stored and be delivered belongs to both. Taking money for it
 * does not: Stripe, the checkout, the customer portal and the invoice list
 * exist only where there is a subscription to manage.
 *
 * The plans themselves stay in server/billing — a self-hosted install still
 * has limits, they just come from its own environment rather than from a
 * price. This file is the seam: the open export replaces it with a copy that
 * registers nothing (see scripts/publish-oss.mjs), so app.ts and the API
 * description are written once and come out right in both editions.
 */

export { billingRoutes, billingWebhook };

/**
 * Work for the daily round. A trial only exists where there is something to
 * subscribe to, so this is the whole of it: warn the organisations whose
 * trial is nearly up, and move the ones whose trial has passed onto Free.
 */
export const hostedDaily: Array<{ name: string; run: () => Promise<string | null> }> = [
  {
    name: "trials",
    async run() {
      const warned = await warnAboutTrials();
      const ended = await endLapsedTrials();
      return warned || ended ? `${warned} ending soon, ${ended} ended` : null;
    },
  },
];

/** The billing endpoints, for the generated API description. */
export const hostedApiDocs: Record<string, ApiDoc> = {
  "GET /billing": { tag: "Billing", summary: "The plan, its limits, and what else there is", description: "On a self-hosted install `billable` is false and the limits are the operator's own." },
  "POST /billing/checkout": { tag: "Billing", summary: "Start a Stripe Checkout session", body: z.object({ plan: z.enum(["solo", "team", "business"]), interval: z.enum(["month", "year"]).optional() }) },
  "POST /billing/portal": { tag: "Billing", summary: "Open the Stripe customer portal" },
  "GET /billing/invoices": { tag: "Billing", summary: "Past invoices" },
};
