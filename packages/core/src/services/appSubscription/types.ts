import type { AppSubscriptionPlanCode } from "./plans";
export type { AppSubscriptionProvider, AppSubscriptionStatusCode, YookassaTrialUnavailableReason, AppSubscriptionStatusDto } from "@gafus/types";

export type AppSubscriptionPlanOfferDto = {
  code: AppSubscriptionPlanCode;
  label: string;
  title: string;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
  enabled: boolean;
  appleProductId: string | null;
  offlineCourseDownloadIncluded: boolean;
  consultationBookingIncluded: boolean;
  cynologistChatIncluded: boolean;
  promoCodeEligible: boolean;
  badge: "TRY" | "POPULAR" | "MAX_SAVINGS" | null;
  savingsRub: number | null;
};

export type AppSubscriptionOfferDto = {
  /** @deprecated Compatibility fallback for clients released before multi-period YooKassa. */
  plans: AppSubscriptionPlanOfferDto[];
  yookassaPlans: AppSubscriptionPlanOfferDto[];
  applePlan: AppSubscriptionPlanOfferDto | null;
  appleAppAccountToken: string | null;
  iosRuCardPaymentEnabled: boolean;
  promoCode: {
    entryEnabled: boolean;
    eligible: boolean;
  };
  /**
   * Registration selection retained for the first eligible checkout.  Keep the
   * lifecycle state too: hiding an expired selection as `null` would make a
   * buyer unknowingly continue at the full price.
   */
  savedRegistrationPromoCode: {
    code: string;
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  } | null;
};
