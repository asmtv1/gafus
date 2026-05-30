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
      yookassaWeeklyPriceRub: 200,
      currency: "RUB",
      intervalDays: 7,
      appleProductId: "premium-week",
    });
    mockTrialFindUnique.mockResolvedValue(null);
  });

  it("includes YooKassa trial availability for users who have not used it", async () => {
    const result = await getAppSubscriptionOffer("user-1");

    expect(result).toMatchObject({
      yookassaPriceRub: 200,
      yookassaTrialAvailable: true,
      yookassaTrialDays: 3,
    });
  });

  it("marks YooKassa trial unavailable after it has been used", async () => {
    mockTrialFindUnique.mockResolvedValue({
      id: "trial-1",
      userId: "user-1",
      provider: "YOOKASSA",
    });

    const result = await getAppSubscriptionOffer("user-1");

    expect(result).toMatchObject({
      yookassaTrialAvailable: false,
      yookassaTrialDays: 3,
    });
  });
});
