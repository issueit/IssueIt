import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
const { readWebhook } = await import("./stripe");

/**
 * The webhook changes what people are paying for, so its signature is the
 * only thing standing between a plan and anyone who finds the URL.
 */
function signed(payload: string, at = Math.floor(Date.now() / 1000), secret = "whsec_test_secret") {
  const v1 = createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex");
  return `t=${at},v1=${v1}`;
}

const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });

describe("the Stripe webhook", () => {
  it("accepts one Stripe signed", () => {
    const event = readWebhook(body, signed(body));
    expect(event.type).toBe("customer.subscription.updated");
    expect(event.data.object.id).toBe("sub_1");
  });

  it("refuses a body that has been changed in flight", () => {
    const header = signed(body);
    const tampered = body.replace("sub_1", "sub_evil");
    expect(() => readWebhook(tampered, header)).toThrow(/doesn't match/);
  });

  it("refuses one signed with another secret", () => {
    expect(() => readWebhook(body, signed(body, undefined, "whsec_someone_else"))).toThrow(/doesn't match/);
  });

  it("refuses a replay of an old one", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(() => readWebhook(body, signed(body, old))).toThrow(/too old/);
  });

  it("refuses a missing or malformed header", () => {
    expect(() => readWebhook(body, undefined)).toThrow(/isn't a Stripe signature/);
    expect(() => readWebhook(body, "v1=deadbeef")).toThrow(/isn't a Stripe signature/);
    expect(() => readWebhook(body, "t=123")).toThrow(/isn't a Stripe signature/);
    // A signature of the right shape but the wrong length must not be compared
    // with timingSafeEqual, which throws on a length mismatch.
    expect(() => readWebhook(body, `t=${Math.floor(Date.now() / 1000)},v1=aa`)).toThrow(/doesn't match/);
  });
});
