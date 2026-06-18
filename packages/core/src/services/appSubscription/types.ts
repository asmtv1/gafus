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
  paidAt: string | null;
  activeUntil: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  isLifetime: boolean;
  provider: AppSubscriptionProvider | null;
  status: AppSubscriptionStatusCode;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
  yookassaTrialUnavailableReason: YookassaTrialUnavailableReason | null;
};

export type AppSubscriptionOfferDto = {
  intervalDays: 7;
  currency: "RUB";
  yookassaPriceRub: number;
  appleProductId: string | null;
  appleAppAccountToken: string | null;
  iosRuCardPaymentEnabled: boolean;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
  yookassaTrialUnavailableReason: YookassaTrialUnavailableReason | null;
};
