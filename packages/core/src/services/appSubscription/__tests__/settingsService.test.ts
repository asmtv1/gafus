import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSubscriptionOffer } from "../settingsService";

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
});
