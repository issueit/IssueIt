import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The plan rules decide what people get for their money, so they are worth
 * testing without a database in the way. The edition is read from the
 * environment at import time, which is why each case imports fresh.
 */
async function load(edition: "hosted" | "selfhost") {
  process.env.EDITION = edition;
  process.env.PLAN_REPORTS_PER_MONTH = "4242";
  vi.resetModules();
  return import("./entitlements");
}

const org = (over: Partial<Parameters<Awaited<ReturnType<typeof load>>["limitsFor"]>[0]> = {}) => ({
  id: "org_test",
  plan: "free" as const,
  planLimits: {},
  trialEndsAt: null,
  billing: {},
  name: "Test",
  ...over,
});

const saved = { ...process.env };
beforeEach(() => void 0);
afterEach(() => {
  process.env = { ...saved };
});

describe("what a plan allows", () => {
  it("gives a self-hosted install everything, with the operator's own limits", async () => {
    const { has, limitsFor, planIdOf } = await load("selfhost");
    const it = org({ plan: "free" });
    expect(planIdOf(it)).toBe("business");
    expect(has(it, "sourcemaps")).toBe(true);
    expect(has(it, "audit")).toBe(true);
    // The environment, not a plan.
    expect(limitsFor(it).reportsPerMonth).toBe(4242);
    expect(limitsFor(it).projects).toBe(0);
    expect(limitsFor(it).retentionDays).toBe(0);
  });

  it("holds paid features back on the hosted free plan", async () => {
    const { has } = await load("hosted");
    const free = org({ plan: "free" });
    // The agent story is free on purpose; the rest of the platform isn't.
    expect(has(free, "tokens")).toBe(true);
    expect(has(free, "mcp")).toBe(true);
    expect(has(free, "sourcemaps")).toBe(false);
    expect(has(free, "config")).toBe(false);
    expect(has(free, "audit")).toBe(false);
    expect(has(free, "whitelabel")).toBe(false);
  });

  it("includes everything on Team except what only Business sells", async () => {
    const { has, limitsFor } = await load("hosted");
    const team = org({ plan: "team" });
    for (const feature of ["tokens", "mcp", "rules", "sourcemaps", "config", "audit", "digest", "whitelabel"] as const) {
      expect(has(team, feature), feature).toBe(true);
    }
    expect(limitsFor(team).projects).toBe(0);
    expect(limitsFor(team).reportsPerMonth).toBe(10_000);
  });

  it("drops to free the moment a trial lapses, without waiting for the nightly job", async () => {
    const { has, limitsFor, planIdOf, trialDaysLeft } = await load("hosted");
    const yesterday = org({ plan: "team", trialEndsAt: new Date(Date.now() - 86_400_000) });
    expect(planIdOf(yesterday)).toBe("free");
    expect(has(yesterday, "audit")).toBe(false);
    expect(limitsFor(yesterday).reportsPerMonth).toBe(100);
    expect(trialDaysLeft(yesterday)).toBe(0);

    const tomorrow = org({ plan: "team", trialEndsAt: new Date(Date.now() + 86_400_000) });
    expect(planIdOf(tomorrow)).toBe("team");
    expect(trialDaysLeft(tomorrow)).toBe(1);
  });

  it("keeps the plan once there's a subscription, whatever the trial said", async () => {
    const { planIdOf, trialDaysLeft } = await load("hosted");
    const paying = org({ plan: "business", trialEndsAt: new Date(Date.now() - 86_400_000), billing: { subscriptionId: "sub_1", status: "active" } });
    expect(planIdOf(paying)).toBe("business");
    expect(trialDaysLeft(paying)).toBeNull();
  });

  it("lets one number be lifted for one organisation without restating the rest", async () => {
    const { limitsFor } = await load("hosted");
    const deal = org({ plan: "team", planLimits: { reportsPerMonth: 250_000 } });
    expect(limitsFor(deal).reportsPerMonth).toBe(250_000);
    // Everything else still comes from the plan.
    expect(limitsFor(deal).retentionDays).toBe(90);
  });

  it("knows which endpoints belong to which feature", async () => {
    const { featureForPath } = await load("hosted");
    expect(featureForPath("/projects/prj_1/releases")).toBe("sourcemaps");
    expect(featureForPath("/projects/prj_1/releases/rel_2/sourcemaps")).toBe("sourcemaps");
    expect(featureForPath("/projects/prj_1/config")).toBe("config");
    expect(featureForPath("/projects/prj_1/rules/preview")).toBe("rules");
    expect(featureForPath("/audit")).toBe("audit");
    // Reports, projects and destinations are the product, not an upsell.
    expect(featureForPath("/reports")).toBeNull();
    expect(featureForPath("/projects")).toBeNull();
    expect(featureForPath("/projects/prj_1/destinations")).toBeNull();
  });

  it("names the plan that would fix a refusal", async () => {
    const { upgradeRequired } = await load("hosted");
    const err = upgradeRequired("sourcemaps");
    expect(err.status).toBe(402);
    expect(err.code).toBe("upgrade_required");
    expect(err.message).toContain("Solo");
    expect(err.details).toMatchObject({ feature: "sourcemaps", plan: "solo" });
  });

  it("starts a hosted organisation on a trial and a self-hosted one on nothing", async () => {
    const hostedStart = (await load("hosted")).startingPlan();
    expect(hostedStart.plan).toBe("team");
    expect(hostedStart.trialEndsAt).toBeInstanceOf(Date);
    const ownStart = (await load("selfhost")).startingPlan();
    expect(ownStart).toEqual({ plan: "free", trialEndsAt: null });
  });
});
