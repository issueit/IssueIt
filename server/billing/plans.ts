import { config } from "../config";
import type { PlanFeature, PlanId, PlanLimits } from "../db/schema";

/**
 * What each plan costs and allows. One table, read by the pricing page, the
 * billing page, the limit checks and Stripe, so none of them can disagree
 * about what someone paid for.
 *
 * Limits are 0 for unlimited everywhere, so a bespoke deal can lift one
 * number without restating the others. Prices are in pence.
 */
export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  /** Who it's for, in the second person, for the pricing page. */
  who: string;
  monthly: number;
  /** Two months off, so a year costs ten. */
  yearly: number;
  limits: PlanLimits;
  features: readonly PlanFeature[];
};

const MB = 1024 * 1024;

export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    blurb: "Everything you need to catch bugs from one product.",
    who: "a side project, or trying Issueit out properly",
    monthly: 0,
    yearly: 0,
    limits: {
      reportsPerMonth: 100,
      projects: 1,
      destinationsPerProject: 2,
      members: 3,
      retentionDays: 7,
      attachmentBytes: 5 * MB,
      attachmentsPerReport: 3,
      reportsPerKeyPerMinute: 30,
      tokenRequestsPerMinute: 60,
    },
    // Tokens and MCP are here on purpose: an agent that can read and file
    // bugs is the reason to try Issueit, not a reason to pay for it.
    features: ["tokens", "mcp"],
  },
  solo: {
    id: "solo",
    name: "Solo",
    blurb: "For one developer looking after real users.",
    who: "a developer with a product in production",
    monthly: 900,
    yearly: 9000,
    limits: {
      reportsPerMonth: 1_000,
      projects: 3,
      destinationsPerProject: 0,
      members: 3,
      retentionDays: 30,
      attachmentBytes: 10 * MB,
      attachmentsPerReport: 5,
      reportsPerKeyPerMinute: 60,
      tokenRequestsPerMinute: 300,
    },
    features: ["tokens", "mcp", "rules", "sourcemaps", "digest"],
  },
  team: {
    id: "team",
    name: "Team",
    blurb: "For a team that triages together and ships from one place.",
    who: "a team of developers sharing an inbox",
    monthly: 2900,
    yearly: 29000,
    limits: {
      reportsPerMonth: 10_000,
      projects: 0,
      destinationsPerProject: 0,
      members: 0,
      retentionDays: 90,
      attachmentBytes: 25 * MB,
      attachmentsPerReport: 10,
      reportsPerKeyPerMinute: 120,
      tokenRequestsPerMinute: 600,
    },
    features: ["tokens", "mcp", "rules", "sourcemaps", "digest", "config", "audit", "whitelabel"],
  },
  business: {
    id: "business",
    name: "Business",
    blurb: "For a product where bug reports are somebody's job: the largest allowance, a year of history, and help when you need it.",
    who: "a company where someone owns the bug queue",
    monthly: 9900,
    yearly: 99000,
    limits: {
      reportsPerMonth: 100_000,
      projects: 0,
      destinationsPerProject: 0,
      members: 0,
      retentionDays: 365,
      attachmentBytes: 50 * MB,
      attachmentsPerReport: 20,
      reportsPerKeyPerMinute: 600,
      tokenRequestsPerMinute: 3_000,
    },
    features: ["tokens", "mcp", "rules", "sourcemaps", "digest", "config", "audit", "whitelabel"],
  },
};

export const planList = Object.values(plans);

/** The plan a new organisation is tried on, before it falls back to free. */
export const TRIAL_PLAN: PlanId = "team";

/** What a feature is called when someone is told they need to pay for it. */
export const featureNames: Record<PlanFeature, string> = {
  tokens: "Account tokens",
  mcp: "The MCP endpoint",
  sourcemaps: "Releases and source maps",
  config: "Configuration as code",
  rules: "Custom grouping and redaction rules",
  audit: "The audit log",
  digest: "Email digests",
  whitelabel: "Removing Issueit's name from the widget",
};

/** The cheapest plan that includes a feature, for "available on Team and above". */
export function cheapestWith(feature: PlanFeature): Plan | null {
  return planList.find((p) => p.features.includes(feature)) ?? null;
}

/** The Stripe price for a plan and interval, when one is configured. */
export function priceIdFor(plan: PlanId, interval: "month" | "year"): string | undefined {
  const prices = config.stripe.prices[plan as keyof typeof config.stripe.prices];
  if (!prices) return undefined;
  return (interval === "month" ? prices.monthly : prices.yearly) || undefined;
}

/** Which plan a Stripe price belongs to, for the webhook. */
export function planForPrice(priceId: string): { plan: PlanId; interval: "month" | "year" } | null {
  for (const plan of planList) {
    const prices = config.stripe.prices[plan.id as keyof typeof config.stripe.prices];
    if (!prices) continue;
    if (prices.monthly && prices.monthly === priceId) return { plan: plan.id, interval: "month" };
    if (prices.yearly && prices.yearly === priceId) return { plan: plan.id, interval: "year" };
  }
  return null;
}

export const money = (pence: number) => (pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`);
