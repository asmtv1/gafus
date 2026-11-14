import { describe, expect, it } from "vitest";
import {Prisma} from "@gafus/prisma"; // Test-only parity oracle, not application runtime.

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

  it("calculates with decimal.js precision and ROUND_HALF_UP to two decimal places", () => {
    const onePercent = calculateAppSubscriptionPromoPrice("2500.00", 1);
    const fiftyPercent = calculateAppSubscriptionPromoPrice("2500.00", 50);
    const halfKopeck = calculateAppSubscriptionPromoPrice("0.05", 10);

    expect(onePercent.originalPrice.toFixed(2)).toBe("2500.00");
    expect(onePercent.discountedPrice.toFixed(2)).toBe("2475.00");
    expect(fiftyPercent.discountedPrice.toFixed(2)).toBe("1250.00");
    expect(halfKopeck.discountedPrice.toFixed(2)).toBe("0.05");
  });

  it("matches Prisma.Decimal production billing rounding across kopeck boundaries",()=>{
    for(const kopecks of [0,1,2,3,5,7,10,49,99,100,1001,2355,249900,500001,99999999]){
      for(const percent of [1,2,5,10,17,33,49,50]){
        const value=(kopecks/100).toFixed(2);
        const expected=new Prisma.Decimal(value).mul(100-percent).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
        const actual=calculateAppSubscriptionPromoPrice(value,percent);
        expect(actual.discountedPrice.toFixed(2)).toBe(expected.toFixed(2));
        expect(actual.originalPrice.toFixed(2)).toBe(new Prisma.Decimal(value).toFixed(2));
      }
    }
  });

  it("rejects invalid calculation inputs", () => {
    expect(() => calculateAppSubscriptionPromoPrice("2500", 0)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("2500", 51)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("2500", 12.5)).toThrow(RangeError);
    expect(() => calculateAppSubscriptionPromoPrice("-1", 10)).toThrow(RangeError);
  });
});
