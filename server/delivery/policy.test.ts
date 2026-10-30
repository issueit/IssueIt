import { describe, expect, it } from "vitest";
import { IntegrationError } from "../integrations/http";
import { timezoneCountry } from "../lib/timezones";
import { testReport } from "./payload";
import { backoffSeconds, defaultPolicy, effectivePolicy, retrySchedule, shapeReport, shouldRetry, takeSlot } from "./policy";

describe("delivery policy", () => {
  it("layers the destination over the organisation over the built-in defaults", () => {
    const p = effectivePolicy({ maxAttempts: 5, timeoutSeconds: 10 }, { maxAttempts: 2, titlePrefix: undefined });
    expect(p.maxAttempts).toBe(2);
    expect(p.timeoutSeconds).toBe(10);
    expect(p.backoff).toBe("standard");
    expect(p.titlePrefix).toBe("");
  });

  it("keeps the standard schedule by default", () => {
    expect(retrySchedule(defaultPolicy)).toEqual([30, 120, 600, 1800, 3600, 10800, 21600]);
  });

  it("computes exponential, linear and fixed waits, capped at the longest wait", () => {
    const base = { ...defaultPolicy, baseDelaySeconds: 10, maxDelaySeconds: 60 };
    expect([1, 2, 3, 4, 5].map((n) => backoffSeconds({ ...base, backoff: "exponential" }, n))).toEqual([10, 20, 40, 60, 60]);
    expect([1, 2, 3].map((n) => backoffSeconds({ ...base, backoff: "linear" }, n))).toEqual([10, 20, 30]);
    expect([1, 2, 3].map((n) => backoffSeconds({ ...base, backoff: "fixed" }, n))).toEqual([10, 10, 10]);
  });

  it("retries by kind of failure, and never when credentials are rejected", () => {
    const server = new IntegrationError("down", { retryable: true, status: 503 });
    const limited = new IntegrationError("slow down", { retryable: true, status: 429 });
    const refused = new IntegrationError("bad request", { retryable: false, status: 400 });
    const expired = new IntegrationError("reconnect", { retryable: false, reconnect: true, status: 401 });
    expect(shouldRetry(defaultPolicy, server)).toBe(true);
    expect(shouldRetry({ ...defaultPolicy, retryServerErrors: false }, server)).toBe(false);
    expect(shouldRetry({ ...defaultPolicy, retryRateLimits: false }, limited)).toBe(false);
    expect(shouldRetry(defaultPolicy, refused)).toBe(false);
    expect(shouldRetry({ ...defaultPolicy, retryClientErrors: true }, refused)).toBe(true);
    expect(shouldRetry({ ...defaultPolicy, retryClientErrors: true }, expired)).toBe(false);
    expect(shouldRetry({ ...defaultPolicy, retryNetworkErrors: false }, null)).toBe(false);
  });

  it("shapes what a destination receives without touching the stored report", () => {
    const report = { ...testReport({ id: "prj_1", name: "Web" }), reporter: { email: "a@b.c", name: "A" }, metadata: { plan: "pro" } };
    const shaped = shapeReport(report, { ...defaultPolicy, titlePrefix: "[Bug]", includeReporter: false, includeMetadata: false });
    expect(shaped.title).toBe("[Bug] Test report from Issueit");
    expect(shaped.reporter).toEqual({ email: null, name: null });
    expect(shaped.metadata).toEqual({});
    expect(report.reporter.email).toBe("a@b.c");
  });

  it("paces deliveries per destination", () => {
    expect(takeSlot("dst_pace", 2)).toBe(0);
    expect(takeSlot("dst_pace", 2)).toBe(0);
    expect(takeSlot("dst_pace", 2)).toBeGreaterThan(0);
    expect(takeSlot("dst_other", 2)).toBe(0);
    expect(takeSlot("dst_free", 0)).toBe(0);
  });
});

describe("report location", () => {
  it("maps browser time zones, including old aliases, to countries", () => {
    expect(timezoneCountry["Europe/London"]).toBe("GB");
    expect(timezoneCountry["Asia/Calcutta"]).toBe("IN");
    expect(timezoneCountry["Europe/Kiev"]).toBe("UA");
    expect(timezoneCountry["America/Sao_Paulo"]).toBe("BR");
    expect(timezoneCountry["UTC"]).toBeUndefined();
  });
});
