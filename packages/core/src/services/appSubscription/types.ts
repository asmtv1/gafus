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
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
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
};

export type AppSubscriptionOfferDto = {
  plans: AppSubscriptionPlanOfferDto[];
  appleAppAccountToken: string | null;
  iosRuCardPaymentEnabled: boolean;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
  yookassaTrialUnavailableReason: YookassaTrialUnavailableReason | null;
};
