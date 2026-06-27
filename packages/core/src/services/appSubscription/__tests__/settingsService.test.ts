import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSubscriptionOffer } from "../settingsService";

const mockSettingsFindUnique = vi.fn();
const mockTrialFindUnique = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscriptionSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    appSubscriptionTrial: {
      findUnique: (...args: unknown[]) => mockTrialFindUnique(...args),
    },
  },
}));

vi.mock("../appleAccountTokenService", () => ({
  ensureAppleAppAccountToken: vi.fn().mockResolvedValue("app-account-token"),
}));

vi.mock("../../appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment_enabled",
  getAppFeatureFlagEnabled: vi.fn().mockResolvedValue(true),
}));

describe("getAppSubscriptionOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    mockTrialFindUnique.mockResolvedValue(null);
  });

  it("includes YooKassa trial availability for users who have not used it", async () => {
    const result = await getAppSubscriptionOffer("user-1");

    expect(result).toMatchObject({
      plans: [
        {
          code: "WEEKLY",
          title: "Недельный",
          intervalDays: 7,
          yookassaPriceRub: 200,
          appleProductId: "premium-week",
        },
        {
          code: "MONTHLY",
          title: "Месячный",
          intervalDays: 30,
          yookassaPriceRub: 1100,
          appleProductId: "premium-month",
        },
      ],
      yookassaTrialAvailable: true,
      yookassaTrialDays: 3,
      yookassaTrialUnavailableReason: null,
    });
  });

  it("filters disabled plans from the public offer", async () => {
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: false,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
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
        yookassaPriceRub: 1100,
      }),
    ]);
  });

  it("marks YooKassa trial unavailable after it has been used", async () => {
    mockTrialFindUnique.mockResolvedValue({
      id: "trial-1",
      userId: "user-1",
      provider: "YOOKASSA",
      trialUnavailableReason: "CARD_FINGERPRINT_REUSED",
    });

    const result = await getAppSubscriptionOffer("user-1");

    expect(result).toMatchObject({
      yookassaTrialAvailable: false,
      yookassaTrialDays: 3,
      yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED",
    });
  });
});
