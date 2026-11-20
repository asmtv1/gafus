import { describe, expect, it, vi } from "vitest";

vi.mock("@gafus/prisma", () => ({ prisma: {} }));

import { classifyGoogleSubscription } from "./google-play-service";

const now = new Date("2026-11-20T00:00:00Z");
const plans = [
  { productId: "premium", basePlanId: "monthly", planCode: "MONTHLY" },
] as const;
type Snapshot = Parameters<typeof classifyGoogleSubscription>[0];

function snapshot(state: Snapshot["subscriptionState"], expiryTime = "2026-12-20T00:00:00Z"): Snapshot {
  return {
    subscriptionState: state,
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    lineItems: [{
      productId: "premium", offerDetails: { basePlanId: "monthly" }, expiryTime,
      autoRenewingPlan: { autoRenewEnabled: state !== "SUBSCRIPTION_STATE_CANCELED" },
    }],
  };
}

describe("Google Play Premium lifecycle", () => {
  it.each([
    ["SUBSCRIPTION_STATE_ACTIVE", "ACTIVE", true, false],
    ["SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "ACTIVE", true, false],
    ["SUBSCRIPTION_STATE_CANCELED", "ACTIVE", true, false],
    ["SUBSCRIPTION_STATE_PENDING", "PENDING", false, true],
    ["SUBSCRIPTION_STATE_ON_HOLD", "PAST_DUE", false, false],
    ["SUBSCRIPTION_STATE_PAUSED", "PAST_DUE", false, false],
    ["SUBSCRIPTION_STATE_EXPIRED", "EXPIRED", false, false],
    ["SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", "CANCELED", false, false],
  ] as const)("%s is stored as %s", (state, status, entitled, pending) => {
    expect(classifyGoogleSubscription(snapshot(state), now, [...plans])).toMatchObject({
      entitled, pending, acknowledgeProduct: entitled ? "premium" : null, data: { status },
    });
  });

  it("keeps paid time after cancellation, then ends access at expiry", () => {
    expect(classifyGoogleSubscription(snapshot("SUBSCRIPTION_STATE_CANCELED"), now, [...plans]))
      .toMatchObject({ entitled: true, data: { cancelAtPeriodEnd: true } });
    expect(classifyGoogleSubscription(snapshot("SUBSCRIPTION_STATE_CANCELED", now.toISOString()), now, [...plans]))
      .toMatchObject({ entitled: false, data: { status: "EXPIRED" } });
  });

  it("rejects a product or base plan outside the server catalog", () => {
    const purchase = snapshot("SUBSCRIPTION_STATE_ACTIVE");
    purchase.lineItems[0]!.offerDetails = { basePlanId: "other" };
    expect(() => classifyGoogleSubscription(purchase, now, [...plans])).toThrow("PLAN_INVALID");
  });

  it("does not use the future item in a deferred replacement before Play grants paid time", () => {
    const purchase = snapshot("SUBSCRIPTION_STATE_ACTIVE");
    purchase.lineItems.push({ productId: "premium", offerDetails: { basePlanId: "quarterly" } });
    expect(classifyGoogleSubscription(purchase, now, [...plans,
      { productId: "premium", basePlanId: "quarterly", planCode: "THREE_MONTHS" },
    ])).toMatchObject({ entitled: true, data: { planCode: "MONTHLY" } });
  });
});
