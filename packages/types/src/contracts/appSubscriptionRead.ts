/** Browser-safe subscription read DTO; no Prisma or Core imports. */
export type AppSubscriptionPlanCode = "WEEKLY" | "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";

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
