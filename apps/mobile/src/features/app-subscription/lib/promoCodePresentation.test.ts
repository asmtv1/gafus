import { describe, expect, it } from "vitest";

import {
  getPromoCodePricePresentation,
  getPromoCodeStateMessage,
  promoCodeStateFromErrorCode,
  shouldBlockYookassaStartForPromo,
  shouldShowSubscriptionPromoCode,
} from "./promoCodePresentation";

describe("mobile subscription promo code presentation", () => {
  it.each([
    ["Android, YooKassa", true, true, true, true],
    ["Android without YooKassa", false, true, true, false],
    ["iOS released flag on", true, true, true, true],
    ["iOS released flag off", true, false, true, false],
    ["iOS review flag on", true, true, true, true],
    ["iOS review flag off", true, false, true, false],
    ["Apple-only", false, true, true, false],
    ["ineligible", true, true, false, false],
  ])("resolves visibility for %s", (_name, canUseYookassa, entryEnabled, eligible, expected) => {
    expect(shouldShowSubscriptionPromoCode({ canUseYookassa, entryEnabled, eligible })).toBe(
      expected,
    );
  });

  it("presents backend prices and legal copy for a 1% discount", () => {
    const result = getPromoCodePricePresentation({
      code: "ONE",
      revision: 1,
      planCode: "MONTHLY",
      discountPercent: 1,
      originalPriceRub: 2500,
      discountedPriceRub: 2475,
      renewalPriceRub: 2500,
      intervalDays: 30,
      currency: "RUB",
    });

    expect(result).toMatchObject({
      discounted: "2 475 ₽",
      originalPrice: "2 500 ₽",
      discount: "−1%",
      firstCharge: "Сейчас спишется 2 475 ₽",
      nextCharge: "Следующее списание произойдёт автоматически через 30 дней — 2 500 ₽",
      legal: "Скидка действует только на первый платёж.",
    });
  });

  it("presents backend prices and legal copy for a 50% discount", () => {
    const result = getPromoCodePricePresentation({
      code: "HALF",
      revision: 7,
      planCode: "THREE_MONTHS",
      discountPercent: 50,
      originalPriceRub: 2500,
      discountedPriceRub: 1250,
      renewalPriceRub: 2500,
      intervalDays: 90,
      currency: "RUB",
    });

    expect(result.discounted).toBe("1 250 ₽");
    expect(result.originalPrice).toBe("2 500 ₽");
    expect(result.discount).toBe("−50%");
    expect(result.nextCharge).toBe("Следующее списание произойдёт автоматически через 90 дней — 2 500 ₽");
  });

  it("maps changed checkout and network errors to actionable states", () => {
    expect(promoCodeStateFromErrorCode("PROMO_CODE_CHANGED")).toBe("changed");
    expect(getPromoCodeStateMessage("changed")).toContain("Примените");
    expect(promoCodeStateFromErrorCode("PROMO_CHECKOUT_IN_PROGRESS")).toBe("checkout_in_progress");
    expect(promoCodeStateFromErrorCode("NETWORK_ERROR")).toBe("network_error");
  });

  it("blocks checkout only for non-empty text without an applied quote", () => {
    expect(shouldBlockYookassaStartForPromo({ hasPromoText: true, hasAppliedPreview: false })).toBe(
      true,
    );
    expect(shouldBlockYookassaStartForPromo({ hasPromoText: true, hasAppliedPreview: true })).toBe(
      false,
    );
    expect(
      shouldBlockYookassaStartForPromo({ hasPromoText: false, hasAppliedPreview: false }),
    ).toBe(false);
  });
});
