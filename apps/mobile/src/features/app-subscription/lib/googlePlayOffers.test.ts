import { beforeEach, describe, expect, it, vi } from "vitest";

const iap = vi.hoisted(() => ({
  initConnection: vi.fn(),
  fetchProducts: vi.fn(),
}));
vi.mock("expo-iap", () => iap);
import { loadGooglePlayOffers } from "./googlePlayOffers";

describe("Google Play checkout catalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iap.initConnection.mockResolvedValue(true);
    iap.fetchProducts.mockResolvedValue([{
      id: "premium", type: "subs", platform: "android", title: "GAFUS Premium",
      subscriptionOfferDetailsAndroid: [
        { basePlanId: "monthly", offerId: null, offerToken: "monthly-token", pricingPhases: { pricingPhaseList: [{ formattedPrice: "399 ₽", billingPeriod: "P1M" }] } },
        { basePlanId: "three-months", offerId: null, offerToken: "expensive-token", pricingPhases: { pricingPhaseList: [{ formattedPrice: "999 ₽", billingPeriod: "P3M" }] } },
      ],
    }]);
  });
  it("sells only the premium THREE_MONTHS tier, displaying Play price and period", async () => {
    const offers = await loadGooglePlayOffers([
      { productId: "premium", basePlanId: "monthly", planCode: "MONTHLY" },
      { productId: "premium", basePlanId: "three-months", planCode: "THREE_MONTHS" },
    ]);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ price: "999 ₽", period: "3 мес.", offerToken: "expensive-token" });
  });
  it("does not query Play if only non-purchasable legacy plans exist", async () => {
    expect(await loadGooglePlayOffers([{ productId: "premium", basePlanId: "monthly", planCode: "MONTHLY" }])).toEqual([]);
    expect(iap.fetchProducts).not.toHaveBeenCalled();
  });
});
