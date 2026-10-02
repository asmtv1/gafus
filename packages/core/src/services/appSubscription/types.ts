import type { AppSubscriptionPlanCode } from "./plans";

export type AppSubscriptionProvider = "YOOKASSA" | "APPLE" | "MANUAL";

export type YookassaTrialUnavailableReason = "CARD_FINGERPRINT_REUSED";

export type AppSubscriptionStatusCode =
  | "ACTIVE"
  | "PENDING"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "REVOKED"
  | null;

export type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  canUseCynologistChat?: boolean;
  canBookConsultations?: boolean;
  paidAt: string | null;
  activeUntil: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  isLifetime: boolean;
  provider: AppSubscriptionProvider | null;
  planCode: AppSubscriptionPlanCode | null;
  status: AppSubscriptionStatusCode;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  /** @deprecated Kept for older app clients; new trials are disabled. */
  yookassaTrialAvailable: boolean;
  /** @deprecated Kept for older app clients; new trials are disabled. */
  yookassaTrialDays: number;
  /** @deprecated Kept for older app clients; new trials are disabled. */
  yookassaTrialUnavailableReason: YookassaTrialUnavailableReason | null;
};

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
