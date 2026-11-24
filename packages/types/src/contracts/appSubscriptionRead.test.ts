import { describe, expect, it } from "vitest";
import {
  resolveAppSubscriptionTier, resolveAppSubscriptionBillingCode, appSubscriptionTierTitle,
  appSubscriptionTierIncludesChat, appSubscriptionTierIncludesConsultations,
} from "@gafus/types";

describe("subscription tier and historical billing code", () => {
  it.each([
    ["WEEKLY", "LEGACY_WEEKLY"], ["TWO_WEEKS", "BASIC"],
    ["MONTHLY", "STANDARD"], ["THREE_MONTHS", "PREMIUM"],
  ])("maps %s to %s losslessly", (code, tier) => {
    expect(resolveAppSubscriptionTier(code)).toBe(tier);
    expect(resolveAppSubscriptionTier(tier)).toBe(tier);
    expect(resolveAppSubscriptionBillingCode(tier)).toBe(code);
    expect(resolveAppSubscriptionBillingCode(code)).toBe(code);
    expect(appSubscriptionTierTitle(code)).toBe(appSubscriptionTierTitle(tier));
  });
  it("does not grant features to unknown or prototype values", () => {
    for (const value of [null, undefined, "unknown", "__proto__", "constructor", 30]) {
      expect(resolveAppSubscriptionTier(value)).toBeNull();
      expect(appSubscriptionTierIncludesChat(value)).toBe(false);
      expect(appSubscriptionTierIncludesConsultations(value)).toBe(false);
    }
  });
  it("grants features by tier, not period", () => {
    expect(appSubscriptionTierIncludesChat("BASIC")).toBe(false);
    expect(appSubscriptionTierIncludesChat("STANDARD")).toBe(true);
    expect(appSubscriptionTierIncludesChat("THREE_MONTHS")).toBe(true);
    expect(appSubscriptionTierIncludesConsultations("STANDARD")).toBe(false);
    expect(appSubscriptionTierIncludesConsultations("PREMIUM")).toBe(true);
  });
});
