/** Browser-safe subscription read DTO; no Prisma or Core imports. */
export type AppSubscriptionPlanCode = "WEEKLY" | "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";

/** Product tier is independent of billing cadence. The old code is a stable wire/storage alias. */
export const APP_SUBSCRIPTION_TIERS = ["LEGACY_WEEKLY", "BASIC", "STANDARD", "PREMIUM"] as const;
export type AppSubscriptionTier = (typeof APP_SUBSCRIPTION_TIERS)[number];
export const APP_SUBSCRIPTION_TIER_BY_BILLING_CODE = {
  WEEKLY: "LEGACY_WEEKLY", TWO_WEEKS: "BASIC", MONTHLY: "STANDARD", THREE_MONTHS: "PREMIUM",
} as const satisfies Record<AppSubscriptionPlanCode, AppSubscriptionTier>;
export const APP_SUBSCRIPTION_BILLING_CODE_BY_TIER = {
  LEGACY_WEEKLY: "WEEKLY", BASIC: "TWO_WEEKS", STANDARD: "MONTHLY", PREMIUM: "THREE_MONTHS",
} as const satisfies Record<AppSubscriptionTier, AppSubscriptionPlanCode>;
export const APP_SUBSCRIPTION_TIER_TITLES = {
  LEGACY_WEEKLY: "Недельный (архивный)",
  BASIC: "Самостоятельный",
  STANDARD: "Поддержка в чате",
  PREMIUM: "Полное сопровождение",
} as const satisfies Record<AppSubscriptionTier, string>;

export function resolveAppSubscriptionTier(value: unknown): AppSubscriptionTier | null {
  if (typeof value !== "string") return null;
  if (Object.prototype.hasOwnProperty.call(APP_SUBSCRIPTION_BILLING_CODE_BY_TIER, value)) {
    return value as AppSubscriptionTier;
  }
  return Object.prototype.hasOwnProperty.call(APP_SUBSCRIPTION_TIER_BY_BILLING_CODE, value)
    ? APP_SUBSCRIPTION_TIER_BY_BILLING_CODE[value as AppSubscriptionPlanCode] : null;
}

export function resolveAppSubscriptionBillingCode(value: unknown): AppSubscriptionPlanCode | null {
  const tier = resolveAppSubscriptionTier(value);
  return tier ? APP_SUBSCRIPTION_BILLING_CODE_BY_TIER[tier] : null;
}

export function appSubscriptionTierTitle(value: unknown): string {
  const tier = resolveAppSubscriptionTier(value);
  return tier ? APP_SUBSCRIPTION_TIER_TITLES[tier] : "Неизвестный тариф";
}

export function appSubscriptionTierIncludesChat(value: unknown): boolean {
  const tier = resolveAppSubscriptionTier(value);
  return tier === "STANDARD" || tier === "PREMIUM";
}

export const appSubscriptionTierIncludesOfflineCourses = appSubscriptionTierIncludesChat;

export function appSubscriptionTierIncludesConsultations(value: unknown): boolean {
  return resolveAppSubscriptionTier(value) === "PREMIUM";
}

export type AppSubscriptionProvider = "YOOKASSA" | "APPLE" | "GOOGLE_PLAY" | "MANUAL";

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
  /** @deprecated Compatibility billing identifier; use planTier for product logic. */
  planCode: AppSubscriptionPlanCode | null;
  planTier?: AppSubscriptionTier | null;
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
  planTier?: AppSubscriptionTier;
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

/** Earlier mobile versions may receive omitted entitlement fields. */
export type LegacyMobileSubscriptionPlanOffer = Omit<AppSubscriptionPlanOfferDto, "code" | "offlineCourseDownloadIncluded" | "cynologistChatIncluded"> & {
  code: Exclude<AppSubscriptionPlanCode, "WEEKLY">;
  offlineCourseDownloadIncluded?: boolean;
  cynologistChatIncluded?: boolean;
};
export type LegacyMobileSubscriptionOffer = Omit<AppSubscriptionOfferDto, "plans" | "yookassaPlans" | "applePlan"> & {
  plans: LegacyMobileSubscriptionPlanOffer[];
  yookassaPlans: LegacyMobileSubscriptionPlanOffer[];
  applePlan: LegacyMobileSubscriptionPlanOffer | null;
  androidQaCardPaymentEnabled?: boolean;
};

export type AppSubscriptionPromoCodePreviewDto = {
  code: string;
  revision: number;
  planCode: Extract<AppSubscriptionPlanCode, "MONTHLY" | "THREE_MONTHS">;
  discountPercent: number;
  originalPriceRub: number;
  discountedPriceRub: number;
  renewalPriceRub: number;
  intervalDays: number;
  currency: "RUB";
};
