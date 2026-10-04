import { describe, expect, it } from "vitest";

import {
  getAppSubscriptionPlanConfig,
  isOfflineCourseDownloadIncludedPlanCode,
} from "../plans";

describe("offline course download plan entitlement", () => {
  it.each([
    ["WEEKLY", false],
    ["TWO_WEEKS", false],
    ["MONTHLY", true],
    ["THREE_MONTHS", true],
    ["UNKNOWN", false],
    [null, false],
  ] as const)("returns %s entitlement as %s", (planCode, expected) => {
    expect(isOfflineCourseDownloadIncludedPlanCode(planCode)).toBe(expected);
  });

  it("exposes the entitlement in tariff presentation", () => {
    expect(getAppSubscriptionPlanConfig(null, "TWO_WEEKS").offlineCourseDownloadIncluded).toBe(
      false,
    );
    expect(getAppSubscriptionPlanConfig(null, "MONTHLY").offlineCourseDownloadIncluded).toBe(
      true,
    );
    expect(
      getAppSubscriptionPlanConfig(null, "THREE_MONTHS").offlineCourseDownloadIncluded,
    ).toBe(true);
  });
});

describe("new monthly offers with unchanged entitlements", () => {
  it.each([
    ["TWO_WEEKS", "Самостоятельный", 1185, false, false, false, false],
    ["MONTHLY", "Поддержка в чате", 1465, true, true, false, true],
    ["THREE_MONTHS", "Полное сопровождение", 2470, true, true, true, true],
  ] as const)("offers %s for 30 days", (code, title, price, offline, chat, consultations, promo) => {
    expect(getAppSubscriptionPlanConfig(null, code)).toMatchObject({
      title, label: title, yookassaPriceRub: price, intervalDays: 30,
      offlineCourseDownloadIncluded: offline, cynologistChatIncluded: chat,
      consultationBookingIncluded: consultations, promoCodeEligible: promo,
      savingsRub: null,
    });
  });
});
