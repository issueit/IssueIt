import type { MiddlewareHandler } from "hono";
import { and, eq, gte, sql } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import type { PlanFeature, PlanId, PlanLimits } from "../db/schema";
import { AppError } from "../lib/errors";
import { queueNotice } from "../mail/notices";
import type { AppEnv } from "../http";
import { subPath } from "../auth/tokens";
import { cheapestWith, featureNames, planList, plans, TRIAL_PLAN, type Plan } from "./plans";

/**
 * What an organisation is allowed, in one place.
 *
 * Everything that enforces a limit or hides a feature asks this module, and
 * this module is the only thing that knows whether the install is the hosted
 * service or someone's own. On a self-hosted install every feature is on and
 * the limits are the operator's environment variables: their server, their
 * rules.
 */

type Org = Pick<typeof schema.organisations.$inferSelect, "id" | "plan" | "planLimits" | "trialEndsAt" | "billing">;

export const hosted = config.edition === "hosted";

/** The operator's own limits, used when nobody is selling anything. */
function operatorLimits(): PlanLimits {
  return {
    reportsPerMonth: config.limits.reportsPerMonth,
    projects: 0,
    destinationsPerProject: 0,
    members: 0,
    retentionDays: 0,
    attachmentBytes: config.limits.attachmentBytes,
    attachmentsPerReport: config.limits.attachmentsPerReport,
    reportsPerKeyPerMinute: config.limits.reportsPerKeyPerMinute,
    tokenRequestsPerMinute: config.limits.tokenRequestsPerMinute,
  };
}

/**
 * The plan in force. A trial is simply a plan with an end date, so this falls
 * back to free the moment it lapses even if the nightly job hasn't run yet.
 */
export function planIdOf(org: Org): PlanId {
  if (!hosted) return "business";
  const lapsed = org.trialEndsAt && org.trialEndsAt.getTime() < Date.now() && !org.billing.subscriptionId;
  return lapsed ? "free" : org.plan;
}

export const planOf = (org: Org): Plan => plans[planIdOf(org)];

/** The numbers that apply, plan then anything agreed for this organisation alone. */
export function limitsFor(org: Org): PlanLimits {
  if (!hosted) return operatorLimits();
  return { ...plans[planIdOf(org)].limits, ...org.planLimits };
}

export function has(org: Org, feature: PlanFeature): boolean {
  if (!hosted) return true;
  return plans[planIdOf(org)].features.includes(feature);
}

export function trialDaysLeft(org: Org): number | null {
  if (!hosted || !org.trialEndsAt || org.billing.subscriptionId) return null;
  const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? days : 0;
}

/** 402, with the plan that would fix it named in the message. */
export function upgradeRequired(feature: PlanFeature): AppError {
  const needed = cheapestWith(feature);
  return new AppError(
    402,
    "upgrade_required",
    `${featureNames[feature]} ${needed ? `is part of ${needed.name} and above.` : "isn't included in this plan."} Change plan in Settings › Billing.`,
    { feature, plan: needed?.id },
  );
}

/**
 * Which parts of the API a plan has to include. One table next to the scope
 * rules it mirrors, so "what does this cost" has a single readable answer
 * and a test can assert on it.
 */
const featureRoutes: Array<[RegExp, PlanFeature]> = [
  [/^\/projects\/[^/]+\/releases(\/|$)/, "sourcemaps"],
  [/^\/projects\/[^/]+\/config(\/|$)/, "config"],
  [/^\/projects\/[^/]+\/rules(\/|$)/, "rules"],
  [/^\/audit(\/|$)/, "audit"],
];

/** The plan feature this path needs, if any. Read by the API reference too. */
export function featureForPath(path: string): PlanFeature | null {
  return featureRoutes.find(([match]) => match.test(path))?.[1] ?? null;
}

/** Refuses a request the organisation's plan doesn't include. */
export const enforceFeatures: MiddlewareHandler<AppEnv> = async (c, next) => {
  const feature = featureForPath(subPath(c));
  if (feature && !has(c.get("org"), feature)) throw upgradeRequired(feature);
  await next();
};

/** The same check for one route that isn't in the table. */
export function requireFeature(feature: PlanFeature): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!has(c.get("org"), feature)) throw upgradeRequired(feature);
    await next();
  };
}

/* ------------------------------------------------------------- the meter */

/** YYYY-MM, the month a usage figure belongs to. */
export const monthKey = (at = new Date()) => at.toISOString().slice(0, 7);

/**
 * Reports this month, counted at most every half minute per organisation and
 * then kept up to date in memory. Intake asks on every report, and the answer
 * only matters to within a few either way: the grace band is wider than the
 * drift.
 */
const counted = new Map<string, { at: number; count: number }>();

export async function reportsThisMonth(orgId: string): Promise<number> {
  const cached = counted.get(orgId);
  if (cached && Date.now() - cached.at < 30_000) return cached.count;
  const since = new Date(`${monthKey()}-01T00:00:00Z`);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.reports)
    .where(and(eq(schema.reports.orgId, orgId), gte(schema.reports.createdAt, since)));
  const count = row?.n ?? 0;
  counted.set(orgId, { at: Date.now(), count });
  return count;
}

/** Counts one more against the month, without going back to the database. */
export function countedOne(orgId: string) {
  const cached = counted.get(orgId);
  if (cached) cached.count += 1;
}

/**
 * How many reports over the allowance are still accepted. Turning intake off
 * the moment a line is crossed loses real bug reports from real users, which
 * is a worse outcome for everyone than a tenth of a month's grace.
 */
export const GRACE = 0.1;

export type Allowance = {
  limit: number;
  used: number;
  /** Nothing more will be accepted after this many. */
  ceiling: number;
  /** Over the allowance but inside the grace band. */
  grace: boolean;
  ok: boolean;
};

export async function allowanceFor(org: Org): Promise<Allowance> {
  const limit = limitsFor(org).reportsPerMonth;
  const used = limit ? await reportsThisMonth(org.id) : 0;
  const ceiling = limit ? Math.ceil(limit * (1 + GRACE)) : 0;
  return { limit, used, ceiling, grace: !!limit && used >= limit, ok: !limit || used < ceiling };
}

/** Records a report Issueit turned away, so the upgrade prompt can say what it cost. */
export async function noteRefusal(orgId: string, reason: "plan_limit" | "storage_limit") {
  await db
    .insert(schema.usageRefusals)
    .values({ orgId, month: monthKey(), reason, count: 1, lastAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.usageRefusals.orgId, schema.usageRefusals.month, schema.usageRefusals.reason],
      set: { count: sql`${schema.usageRefusals.count} + 1`, lastAt: new Date() },
    })
    .catch((err) => console.error("[usage] couldn't record a refusal", err));
}

export async function refusedThisMonth(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.usageRefusals.count}), 0)::int` })
    .from(schema.usageRefusals)
    .where(and(eq(schema.usageRefusals.orgId, orgId), eq(schema.usageRefusals.month, monthKey())));
  return row?.n ?? 0;
}

/**
 * Tells the owners once a month that they are near the line, and once again
 * when reports start being turned away. Dedupe keys do the "once": the
 * second report over the allowance mustn't send a second email.
 */
export async function warnAboutUsage(org: Org & { name: string }, allowance: Allowance) {
  if (!hosted || !allowance.limit) return;
  const percent = Math.floor((allowance.used / allowance.limit) * 100);
  const stage = !allowance.ok ? "limit-reached" : percent >= 100 ? "limit-reached" : percent >= 80 ? "limit-warning" : null;
  if (!stage) return;
  const owners = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.role, "owner")));
  const refused = stage === "limit-reached" ? await refusedThisMonth(org.id) : 0;
  await Promise.all(
    owners.map((owner) =>
      queueNotice({
        to: owner.email,
        kind: stage,
        orgId: org.id,
        userId: owner.id,
        dedupeKey: `${stage}:${org.id}:${monthKey()}`,
        context: {
          orgName: org.name,
          plan: plans[planIdOf(org)].name,
          used: allowance.used,
          limit: allowance.limit,
          percent: Math.min(percent, 100),
          refused,
          url: `${config.appUrl}/settings/billing`,
        },
      }),
    ),
  ).catch((err) => console.error("[usage] couldn't warn about the allowance", err));
}

/**
 * Refuses one more of something the plan caps. The message names the number
 * and what to do about it, because "limit reached" on its own tells nobody
 * anything.
 */
export async function assertRoom(org: Org, what: "projects" | "destinations", countQuery: Promise<number>) {
  const limits = limitsFor(org);
  const limit = what === "projects" ? limits.projects : limits.destinationsPerProject;
  if (!limit) return;
  const used = await countQuery;
  if (used < limit) return;
  const noun = what === "projects" ? `${limit === 1 ? "one project" : `${limit} projects`}` : `${limit} destinations a project`;
  const next = planList.find((p) => {
    const l = p.limits[what === "projects" ? "projects" : "destinationsPerProject"];
    return !l || l > limit;
  });
  throw new AppError(402, "upgrade_required", `This plan covers ${noun}.${next ? ` ${next.name} covers more.` : ""} Change plan in Settings › Billing.`, {
    feature: what,
    plan: next?.id,
  });
}

/** What a brand new organisation starts on. */
export function startingPlan(): { plan: PlanId; trialEndsAt: Date | null } {
  if (!hosted || !config.trialDays) return { plan: "free", trialEndsAt: null };
  return { plan: TRIAL_PLAN, trialEndsAt: new Date(Date.now() + config.trialDays * 86_400_000) };
}
