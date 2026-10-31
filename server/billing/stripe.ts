import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { AppError } from "../lib/errors";

/**
 * Stripe, over its REST API with fetch.
 *
 * No SDK: the three calls Issueit makes are form-encoded POSTs, the webhook
 * signature is an HMAC, and a payment library in the bundle is a dependency
 * on somebody else's release schedule for no benefit. Everything here fails
 * loudly if Stripe isn't configured rather than half-working.
 */

const API = "https://api.stripe.com/v1";

export const stripeConfigured = () => !!config.stripe.secretKey;

/** Stripe's bracket notation: line_items[0][price]=price_123. */
function form(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") out.push(...form(item as Record<string, unknown>, `${name}[${i}]`));
        else out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      out.push(...form(value as Record<string, unknown>, name));
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

type StripeError = { error?: { message?: string; code?: string; type?: string } };

async function call<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
  if (!stripeConfigured()) throw new AppError(503, "billing_unavailable", "Payments aren't set up on this server.");
  const body = params ? form(params).join("&") : undefined;
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${config.stripe.secretKey}`,
      "stripe-version": "2025-09-30.clover",
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & StripeError) : ({} as T & StripeError);
  if (!res.ok) {
    const message = data.error?.message ?? `Stripe replied ${res.status}.`;
    console.error("[stripe]", method, path, res.status, message);
    // Stripe's own messages are written for the person paying, so they're
    // shown as they are rather than hidden behind "something went wrong".
    throw new AppError(res.status === 400 || res.status === 402 ? 400 : 502, "billing_error", message);
  }
  return data;
}

/* ------------------------------------------------------------- customers */

export type Customer = { id: string; email?: string | null; metadata?: Record<string, string> };

export const createCustomer = (input: { orgId: string; orgName: string; email: string; name?: string }) =>
  call<Customer>("POST", "/customers", {
    email: input.email,
    name: input.orgName,
    // So a Stripe dashboard row can be traced back without guessing.
    metadata: { orgId: input.orgId, orgName: input.orgName, invoiced_for: input.name ?? "" },
  });

/* ------------------------------------------------------- checkout and portal */

export type CheckoutSession = { id: string; url: string };

export function createCheckout(input: {
  customerId: string;
  priceId: string;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}) {
  return call<CheckoutSession>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.orgId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // Stripe works out VAT from the address, so Issueit doesn't have to.
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    subscription_data: {
      metadata: { orgId: input.orgId },
      ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
    },
  });
}

export const createPortal = (customerId: string, returnUrl: string) =>
  call<{ id: string; url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });

/* ------------------------------------------------------------ subscriptions */

export type Subscription = {
  id: string;
  status: string;
  customer: string;
  cancel_at: number | null;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  trial_end: number | null;
  metadata?: Record<string, string>;
  items: { data: Array<{ price: { id: string; recurring?: { interval: string } }; current_period_end?: number }> };
};

export const getSubscription = (id: string) => call<Subscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);

export type Invoice = {
  id: string;
  number: string | null;
  status: string;
  total: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

export const listInvoices = (customerId: string, limit = 12) =>
  call<{ data: Invoice[] }>("GET", "/invoices", { customer: customerId, limit });

/* ---------------------------------------------------------------- webhooks */

export type StripeEvent = { id: string; type: string; data: { object: Record<string, any> } };

/**
 * Checks Stripe's signature before a word of the body is believed. Without
 * this an endpoint that changes plans is open to anyone who finds its URL.
 */
export function readWebhook(payload: string, header: string | undefined, toleranceSeconds = 300): StripeEvent {
  if (!config.stripe.webhookSecret) throw new AppError(503, "billing_unavailable", "This server has no Stripe webhook secret set.");
  const parts = Object.fromEntries(
    (header ?? "")
      .split(",")
      .map((part) => part.split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1) throw new AppError(400, "invalid_signature", "That isn't a Stripe signature.");
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) throw new AppError(400, "invalid_signature", "That webhook is too old to accept.");
  const expected = createHmac("sha256", config.stripe.webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const given = Buffer.from(parts.v1);
  if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected))) {
    throw new AppError(400, "invalid_signature", "That webhook's signature doesn't match.");
  }
  return JSON.parse(payload) as StripeEvent;
}
