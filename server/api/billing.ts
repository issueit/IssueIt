import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import type { OrgBilling, PlanId } from "../db/schema";
import { AppError, badRequest } from "../lib/errors";
import { body, type AppEnv } from "../http";
import { requireOwner } from "../auth/session";
import { hosted, limitsFor, planIdOf, refusedThisMonth, reportsThisMonth, trialDaysLeft } from "../billing/entitlements";
import { money, planForPrice, planList, plans, priceIdFor } from "../billing/plans";
import { createCheckout, createCustomer, createPortal, getSubscription, listInvoices, readWebhook, stripeConfigured } from "../billing/stripe";
import { queueNotice } from "../mail/notices";

/**
 * What this organisation is on, what else there is, and the two buttons that
 * change it. Everything that actually moves money happens in Stripe: Issueit
 * never sees a card, and the webhook is the only thing that writes a plan.
 */

const asView = (plan: (typeof planList)[number], current: PlanId) => ({
  id: plan.id,
  name: plan.name,
  blurb: plan.blurb,
  who: plan.who,
  monthly: plan.monthly,
  yearly: plan.yearly,
  monthlyLabel: plan.monthly ? money(plan.monthly) : "Free",
  yearlyLabel: plan.yearly ? money(plan.yearly) : "Free",
  limits: plan.limits,
  features: plan.features,
  current: plan.id === current,
  /** False when nobody has put a price id in the environment for it. */
  buyable: plan.monthly > 0 && (!!priceIdFor(plan.id, "month") || !!priceIdFor(plan.id, "year")),
});

export const billingRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const org = c.get("org");
    const current = planIdOf(org);
    const [used, refused] = await Promise.all([reportsThisMonth(org.id), refusedThisMonth(org.id)]);
    return c.json({
      edition: config.edition,
      /** False on a self-hosted install: there is nothing to buy, and no limits but the operator's. */
      billable: hosted && stripeConfigured(),
      plan: current,
      planName: plans[current].name,
      limits: limitsFor(org),
      features: plans[current].features,
      trialDaysLeft: trialDaysLeft(org),
      usage: { reports: used, refused },
      subscription: {
        status: org.billing.status ?? null,
        periodEnd: org.billing.periodEnd ?? null,
        cancelAt: org.billing.cancelAt ?? null,
        interval: org.billing.interval ?? null,
        problem: org.billing.problem ?? null,
        /** Whether there's a Stripe customer to open a portal for. */
        manageable: !!org.billing.customerId,
      },
      plans: planList.map((p) => asView(p, current)),
    });
  })
  /** Hands back a Stripe Checkout URL. The plan only changes when the webhook says so. */
  .post("/checkout", requireOwner, async (c) => {
    const input = await body(c, z.object({ plan: z.enum(["solo", "team", "business"]), interval: z.enum(["month", "year"]).default("month") }));
    if (!hosted) throw new AppError(503, "not_billable", "This is a self-hosted install, so there's nothing to pay for.");
    const priceId = priceIdFor(input.plan, input.interval);
    if (!priceId) throw new AppError(503, "billing_unavailable", `No ${input.interval}ly price is configured for ${plans[input.plan].name}.`);
    const org = c.get("org");
    const customerId = await ensureCustomer(org, c.get("user"));
    const session = await createCheckout({
      customerId,
      priceId,
      orgId: org.id,
      successUrl: `${config.appUrl}/settings/billing?paid=1`,
      cancelUrl: `${config.appUrl}/settings/billing`,
    });
    return c.json({ url: session.url });
  })
  /** The Stripe customer portal: cards, invoices, cancelling, VAT details. */
  .post("/portal", requireOwner, async (c) => {
    const org = c.get("org");
    if (!org.billing.customerId) throw badRequest("There's no subscription to manage yet.");
    const session = await createPortal(org.billing.customerId, `${config.appUrl}/settings/billing`);
    return c.json({ url: session.url });
  })
  .get("/invoices", async (c) => {
    const org = c.get("org");
    if (!org.billing.customerId || !stripeConfigured()) return c.json({ invoices: [] });
    const { data } = await listInvoices(org.billing.customerId);
    return c.json({
      invoices: data.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        total: i.total,
        currency: i.currency.toUpperCase(),
        createdAt: new Date(i.created * 1000).toISOString(),
        url: i.hosted_invoice_url,
        pdf: i.invoice_pdf,
      })),
    });
  });

async function ensureCustomer(org: typeof schema.organisations.$inferSelect, user: { email: string; name: string }): Promise<string> {
  if (org.billing.customerId) return org.billing.customerId;
  const customer = await createCustomer({ orgId: org.id, orgName: org.name, email: user.email, name: user.name });
  await saveBilling(org.id, { customerId: customer.id });
  return customer.id;
}

async function saveBilling(orgId: string, patch: Partial<OrgBilling>) {
  const [row] = await db
    .update(schema.organisations)
    .set({ billing: sql`${schema.organisations.billing} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
    .where(eq(schema.organisations.id, orgId))
    .returning();
  return row;
}

/* ---------------------------------------------------------------- webhook */

/**
 * Stripe's side of the conversation, and the only thing in Issueit that
 * writes a plan. Mounted outside the authenticated API: the signature is the
 * authentication, and the raw body is needed to check it.
 */
export const billingWebhook = new Hono().post("/", async (c) => {
  const payload = await c.req.text();
  const event = readWebhook(payload, c.req.header("stripe-signature"));
  try {
    await handle(event.type, event.data.object);
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient fault.
    console.error("[stripe] couldn't handle", event.type, err);
    throw err;
  }
  return c.json({ received: true });
});

async function orgFor(object: Record<string, any>): Promise<typeof schema.organisations.$inferSelect | null> {
  const id = object.metadata?.orgId ?? object.client_reference_id;
  if (id) {
    const byId = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, id) });
    if (byId) return byId;
  }
  const customer = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customer) return null;
  const [byCustomer] = await db
    .select()
    .from(schema.organisations)
    .where(sql`${schema.organisations.billing}->>'customerId' = ${customer}`)
    .limit(1);
  return byCustomer ?? null;
}

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : undefined);

async function handle(type: string, object: Record<string, any>) {
  switch (type) {
    case "checkout.session.completed": {
      const org = await orgFor(object);
      if (!org) return;
      // The subscription events carry the detail; this just makes sure the
      // customer is attached even if they arrive out of order.
      await saveBilling(org.id, { customerId: typeof object.customer === "string" ? object.customer : object.customer?.id });
      if (object.subscription) await applySubscription(org.id, await getSubscription(String(object.subscription)));
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const org = await orgFor(object);
      if (!org) return;
      await applySubscription(org.id, object as any, type === "customer.subscription.deleted");
      return;
    }

    case "invoice.payment_failed": {
      const org = await orgFor(object);
      if (!org) return;
      const problem = object.last_finalization_error?.message ?? "The payment was declined.";
      await saveBilling(org.id, { problem });
      const owners = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(sql`${schema.memberships.orgId} = ${org.id} and ${schema.memberships.role} = 'owner'`);
      await Promise.all(
        owners.map((owner) =>
          queueNotice({
            to: owner.email,
            kind: "payment-problem",
            orgId: org.id,
            userId: owner.id,
            dedupeKey: `payment-problem:${object.id}`,
            context: { orgName: org.name, problem, url: `${config.appUrl}/settings/billing` },
          }),
        ),
      );
      return;
    }

    case "invoice.payment_succeeded": {
      const org = await orgFor(object);
      if (org) await saveBilling(org.id, { problem: undefined });
      return;
    }
  }
}

/** Turns a Stripe subscription into the plan this organisation is on. */
async function applySubscription(orgId: string, subscription: Awaited<ReturnType<typeof getSubscription>>, deleted = false) {
  const item = subscription.items?.data?.[0];
  const matched = item ? planForPrice(item.price.id) : null;
  const gone = deleted || ["canceled", "incomplete_expired"].includes(subscription.status);
  const plan: PlanId = gone || !matched ? "free" : matched.plan;
  if (!matched && !gone) console.warn("[stripe] no plan matches price", item?.price.id, "- leaving", orgId, "on free");

  await db
    .update(schema.organisations)
    .set({
      plan,
      // A paid subscription ends the trial, whichever way it goes.
      trialEndsAt: null,
      billing: sql`${schema.organisations.billing} || ${JSON.stringify({
        customerId: typeof subscription.customer === "string" ? subscription.customer : undefined,
        subscriptionId: gone ? undefined : subscription.id,
        status: gone ? "canceled" : (subscription.status as OrgBilling["status"]),
        priceId: item?.price.id,
        interval: (item?.price.recurring?.interval === "year" ? "year" : "month") as OrgBilling["interval"],
        periodEnd: iso(item?.current_period_end ?? subscription.current_period_end),
        cancelAt: subscription.cancel_at_period_end ? iso(subscription.cancel_at) : undefined,
        problem: undefined,
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(schema.organisations.id, orgId));
}

/** Used by the jobs: everyone whose trial has run out. */
export async function endLapsedTrials(): Promise<number> {
  if (!hosted) return 0;
  const lapsed = await db
    .update(schema.organisations)
    .set({ plan: "free", trialEndsAt: null, updatedAt: new Date() })
    .where(sql`${schema.organisations.trialEndsAt} is not null and ${schema.organisations.trialEndsAt} < now() and ${schema.organisations.billing}->>'subscriptionId' is null`)
    .returning({ id: schema.organisations.id, name: schema.organisations.name, plan: schema.organisations.plan });
  for (const org of lapsed) {
    const owners = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(sql`${schema.memberships.orgId} = ${org.id} and ${schema.memberships.role} = 'owner'`);
    await Promise.all(
      owners.map((owner) =>
        queueNotice({
          to: owner.email,
          kind: "trial-ending",
          orgId: org.id,
          userId: owner.id,
          dedupeKey: `trial-ended:${org.id}`,
          context: { orgName: org.name, days: 0, plan: plans.team.name, url: `${config.appUrl}/settings/billing` },
        }),
      ),
    );
  }
  return lapsed.length;
}

/** Trials ending in the next few days, so there's a warning before the change. */
export async function warnAboutTrials(days = 3): Promise<number> {
  if (!hosted) return 0;
  const soon = await db
    .select({ id: schema.organisations.id, name: schema.organisations.name, plan: schema.organisations.plan, trialEndsAt: schema.organisations.trialEndsAt })
    .from(schema.organisations)
    .where(
      sql`${schema.organisations.trialEndsAt} between now() and now() + make_interval(days => ${days}) and ${schema.organisations.billing}->>'subscriptionId' is null`,
    );
  for (const org of soon) {
    const left = Math.max(1, Math.ceil((org.trialEndsAt!.getTime() - Date.now()) / 86_400_000));
    const owners = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(sql`${schema.memberships.orgId} = ${org.id} and ${schema.memberships.role} = 'owner'`);
    await Promise.all(
      owners.map((owner) =>
        queueNotice({
          to: owner.email,
          kind: "trial-ending",
          orgId: org.id,
          userId: owner.id,
          dedupeKey: `trial-ending:${org.id}`,
          context: { orgName: org.name, days: left, plan: plans[org.plan].name, url: `${config.appUrl}/settings/billing` },
        }),
      ),
    );
  }
  return soon.length;
}
