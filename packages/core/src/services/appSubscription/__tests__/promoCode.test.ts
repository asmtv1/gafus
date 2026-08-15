import { describe, expect, it } from "vitest";

import {
  calculateAppSubscriptionPromoPrice,
  isValidAppSubscriptionPromoDiscountPercent,
  normalizeAppSubscriptionPromoCode,
  parseAppSubscriptionPromoCode,
} from "../promoCode";

describe("app subscription promo code domain", () => {
  it("trims display input and normalizes lookup identity case-insensitively", () => {
    expect(parseAppSubscriptionPromoCode(" kisa1488 ")).toEqual({
      code: "kisa1488",
      normalizedCode: "KISA1488",
    });
    expect(normalizeAppSubscriptionPromoCode(" KiSa_14-88 ")).toBe("KISA_14-88");
  });

  it.each(["", " ", "киса", "code!", "two words", "a".repeat(65), null, 42])(
    "rejects invalid code %j",
    (value) => {
      expect(parseAppSubscriptionPromoCode(value)).toBeNull();
    },
  );

  it.each([1, 50])("accepts the %i%% discount boundary", (discountPercent) => {
    expect(isValidAppSubscriptionPromoDiscountPercent(discountPercent)).toBe(true);
  });

  it.each([0, 51, 1.5, Number.NaN, "10", null])(
    "rejects an invalid discount %j",
    (discountPercent) => {
      expect(isValidAppSubscriptionPromoDiscountPercent(discountPercent)).toBe(false);
    },
  );

  it("calculates with Prisma.Decimal and ROUND_HALF_UP to two decimal places", () => {
    const onePercent = calculateAppSubscriptionPromoPrice("2500.00", 1);
    const fiftyPercent = calculateAppSubscriptionPromoPrice("2500.00", 50);
    const halfKopeck = calculateAppSubscriptionPromoPrice("0.05", 10);

    expect(onePercent.originalPrice.toFixed(2)).toBe("2500.00");
    expect(onePercent.discountedPrice.toFixed(2)).toBe("2475.00");
    expect(fiftyPercent.discountedPrice.toFixed(2)).toBe("1250.00");
    expect(halfKopeck.discountedPrice.toFixed(2)).toBe("0.05");
  });

  it("rejects invalid calculation inputs", () => {
    expect(() => calculateAppSubscriptionPromoPrice("2500", 0)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("2500", 51)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("2500", 12.5)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("-1", 10)).toThrow(RangeError);
  });
});
