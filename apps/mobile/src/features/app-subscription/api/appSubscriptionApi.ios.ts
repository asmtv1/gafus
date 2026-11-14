/**
 * iOS-only Metro replacement for appSubscriptionApi. The feature's public
 * index and shared status hooks can safely import the existing API symbol,
 * without ever bundling YooKassa checkout, promo preview or payment URLs.
 */
export type {
  AppSubscriptionStatusDto,
  AppSubscriptionOfferDto,
  AppSubscriptionPlanOfferDto,
  AppSubscriptionPlanCode,
  AppSubscriptionPlanBadge,
  AppSubscriptionPromoCodePreviewDto,
} from "./appSubscriptionApi";
export { appSubscriptionAppleApi as appSubscriptionApi } from "./appSubscriptionAppleApi";
