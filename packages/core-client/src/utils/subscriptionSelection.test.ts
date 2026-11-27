import { describe, it, expect } from "vitest";
import { selectDefaultSubscriptionPlan } from "./subscriptionSelection";

describe("shared subscription default selection", () => {
  it("prefers Standard, including the historical billing code", () => {
    const basic = { code: "TWO_WEEKS" };
    const monthly = { code: "MONTHLY" };
    expect(selectDefaultSubscriptionPlan([basic, monthly])).toBe(monthly);
    const explicit = { code: "THREE_MONTHS", planTier: "STANDARD" };
    expect(selectDefaultSubscriptionPlan([basic, explicit])).toBe(explicit);
  });
  it("never selects disabled plans and returns null for an empty offer", () => {
    const basic = { code: "TWO_WEEKS", enabled: true };
    const disabled = { code: "MONTHLY", enabled: false };
    expect(selectDefaultSubscriptionPlan([disabled, basic])).toBe(basic);
    expect(selectDefaultSubscriptionPlan([disabled])).toBeNull();
    expect(selectDefaultSubscriptionPlan(undefined)).toBeNull();
  });
});
