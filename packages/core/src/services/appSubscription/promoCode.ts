import { Prisma } from "@gafus/prisma";

export const APP_SUBSCRIPTION_PROMO_CODE_MIN_LENGTH = 1;
export const APP_SUBSCRIPTION_PROMO_CODE_MAX_LENGTH = 64;
export const APP_SUBSCRIPTION_PROMO_CODE_MIN_DISCOUNT_PERCENT = 1;
export const APP_SUBSCRIPTION_PROMO_CODE_MAX_DISCOUNT_PERCENT = 50;
export const APP_SUBSCRIPTION_PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type AppSubscriptionPromoCodeValue = Prisma.Decimal | number | string;

export type AppSubscriptionPromoCodeIdentity = {
  code: string;
  normalizedCode: string;
};

export type AppSubscriptionPromoPrice = {
  originalPrice: Prisma.Decimal;
  discountedPrice: Prisma.Decimal;
  discountPercent: number;
};

export function normalizeAppSubscriptionPromoCode(value: string): string {
  return value.trim().toUpperCase();
}

export function parseAppSubscriptionPromoCode(
  value: unknown,
): AppSubscriptionPromoCodeIdentity | null {
  if (typeof value !== "string") return null;

  const code = value.trim();
  if (!APP_SUBSCRIPTION_PROMO_CODE_PATTERN.test(code)) return null;

  return {
    code,
    normalizedCode: normalizeAppSubscriptionPromoCode(code),
  };
}

export function isValidAppSubscriptionPromoDiscountPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= APP_SUBSCRIPTION_PROMO_CODE_MIN_DISCOUNT_PERCENT &&
    value <= APP_SUBSCRIPTION_PROMO_CODE_MAX_DISCOUNT_PERCENT
  );
}

export function calculateAppSubscriptionPromoPrice(
  originalPriceValue: AppSubscriptionPromoCodeValue,
  discountPercent: number,
): AppSubscriptionPromoPrice {
  if (!isValidAppSubscriptionPromoDiscountPercent(discountPercent)) {
    throw new RangeError("Promo code discount must be an integer from 1 to 50");
  }

  const originalPrice = new Prisma.Decimal(originalPriceValue);
  if (!originalPrice.isFinite() || originalPrice.isNegative()) {
    throw new RangeError("Promo code original price must be a non-negative finite amount");
  }

  const discountedPrice = originalPrice
    .mul(100 - discountPercent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    originalPrice: originalPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    discountedPrice,
    discountPercent,
  };
}
