import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSubscriptionOfferReader } from "../settingsService";

const mockReadOffer = vi.fn();
const getAppSubscriptionOffer = createSubscriptionOfferReader({
  readOfferSnapshot: mockReadOffer,
  readMobileFlag: vi.fn().mockResolvedValue(true),
  readPromoCodeState: vi.fn().mockResolvedValue({ entryEnabled: true, eligible: true }),
});

describe("getAppSubscriptionOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOffer.mockResolvedValue({
      settings: {
        monthlyEnabled: true,
        yookassaMonthlyPriceRub: 2500,
        currency: "RUB",
        weeklyIntervalDays: 7,
        monthlyIntervalDays: 30,
        weeklyAppleProductId: "premium-week",
        monthlyAppleProductId: "premium-month",
      },
      appleAppAccountToken: "persisted-apple-id",
      savedRegistrationPromoCode: null,
    });
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
    mockReadOffer.mockResolvedValue({
      settings: {
        weeklyEnabled: false,
        monthlyEnabled: true,
        yookassaWeeklyPriceRub: 200,
        yookassaMonthlyPriceRub: 2500,
        currency: "RUB",
        weeklyIntervalDays: 7,
        monthlyIntervalDays: 30,
        weeklyAppleProductId: "premium-week",
        monthlyAppleProductId: "premium-month",
      },
      appleAppAccountToken: "persisted-apple-id",
      savedRegistrationPromoCode: null,
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
    const result = await getAppSubscriptionOffer("user-1", { platform: "ios", version: "1.7.0" });
    expect(result.appleAppAccountToken).toBe("persisted-apple-id");
    expect(mockReadOffer).toHaveBeenCalledWith("user-1");
  });

  it("G1 snapshot token returns null for uninitialized account rather than random UUID", async () => {
    mockReadOffer.mockResolvedValue({
      settings: null, appleAppAccountToken: null, savedRegistrationPromoCode: null,
    });
    const result = await getAppSubscriptionOffer("user-missing");
    expect(result.appleAppAccountToken).toBeNull();
    expect(mockReadOffer).toHaveBeenCalledWith("user-missing");
  });
  it("read-only legacy GET alias never allocates token", async () => {
    mockReadOffer.mockResolvedValue({
      settings: null, appleAppAccountToken: null, savedRegistrationPromoCode: null,
    });
    const offer = await getAppSubscriptionOffer("actor-id", { platform: "ios", version: "1.7.3" });
    expect(offer.appleAppAccountToken).toBeNull();
    expect(mockReadOffer).toHaveBeenCalledExactlyOnceWith("actor-id");
  });
});
