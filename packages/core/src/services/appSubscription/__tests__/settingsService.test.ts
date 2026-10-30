import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSubscriptionOffer, getAppSubscriptionOfferSnapshot } from "../settingsService";
import { ensureAppleAppAccountToken } from "../appleAccountTokenService";

const mockSettingsFindUnique = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockUserFindUnique = vi.fn();
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    appSubscriptionSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    appSubscriptionPayment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
    },
  },
}));

vi.mock("../appleAccountTokenService", () => ({
  ensureAppleAppAccountToken: vi.fn().mockResolvedValue("app-account-token"),
}));

vi.mock("../../appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment_enabled",
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES:
    "mobile_ios_subscription_promo_codes",
  getMobileFeatureFlagEnabled: vi.fn().mockResolvedValue(true),
}));

describe("getAppSubscriptionOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsFindUnique.mockResolvedValue({
      monthlyEnabled: true,
      yookassaMonthlyPriceRub: 2500,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("returns only the monthly plan", async () => {
    const result = await getAppSubscriptionOffer("user-1");

    expect(result).toMatchObject({
      plans: [
        {
          code: "MONTHLY",
          title: "Поддержка в чате",
          intervalDays: 30,
          yookassaPriceRub: 2500,
          appleProductId: "premium-month",
        },
      ],
      promoCode: { entryEnabled: true, eligible: true },
    });
  });

  it("filters disabled plans from the public offer", async () => {
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: false,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 2500,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });

    const result = await getAppSubscriptionOffer("user-1");

    expect(result.plans).toEqual([
      expect.objectContaining({
        code: "MONTHLY",
        enabled: true,
        yookassaPriceRub: 2500,
      }),
    ]);
  });

  it("G1 snapshot token returns existing persisted identity without allocation", async () => {
    mockUserFindUnique.mockImplementation(
      async ({ select }: { select: { appleAppAccountToken?: boolean } }) =>
        select.appleAppAccountToken ? { appleAppAccountToken: "persisted-apple-id" } : null,
    );
    const result = await getAppSubscriptionOfferSnapshot("user-1", { platform: "ios", version: "1.7.0" });
    expect(result.appleAppAccountToken).toBe("persisted-apple-id");
    expect(ensureAppleAppAccountToken).not.toHaveBeenCalled();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" }, select: { appleAppAccountToken: true },
    });
  });

  it("G1 snapshot token returns null for uninitialized account rather than random UUID", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const result = await getAppSubscriptionOfferSnapshot("user-missing");
    expect(result.appleAppAccountToken).toBeNull();
    expect(ensureAppleAppAccountToken).not.toHaveBeenCalled();
  });
});
