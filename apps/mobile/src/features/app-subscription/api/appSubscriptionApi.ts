import { apiClient, type ApiResponse } from "@/shared/lib/api/client";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  paidAt: string | null;
  activeUntil: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  isLifetime: boolean;
  provider: "YOOKASSA" | "APPLE" | "MANUAL" | null;
  planCode: AppSubscriptionPlanCode | null;
  status:
    | "ACTIVE"
    | "PENDING"
    | "PAST_DUE"
    | "CANCELED"
    | "EXPIRED"
    | "REFUNDED"
    | "REVOKED"
    | null;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
  yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED" | null;
};

export type AppSubscriptionPlanCode = "WEEKLY" | "MONTHLY";

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
  yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED" | null;
};

export const appSubscriptionApi = {
  getStatus(): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient<AppSubscriptionStatusDto>("/api/v1/app-subscription/status");
  },
  getOffer(): Promise<ApiResponse<AppSubscriptionOfferDto>> {
    return apiClient<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer");
  },
  async startYookassa(
    planCode: AppSubscriptionPlanCode,
  ): Promise<ApiResponse<{ confirmationUrl: string; localSubscriptionId: string }>> {
    if (isDev) console.log("[appSubscriptionApi] startYookassa request", { planCode });
    const result = await apiClient<{ confirmationUrl: string; localSubscriptionId: string }>(
      "/api/v1/app-subscription/yookassa/start",
      { method: "POST", body: { planCode } },
    );
    if (isDev) {
      console.log("[appSubscriptionApi] startYookassa response", {
        success: result.success,
        error: result.error,
        code: result.code,
        hasConfirmationUrl: Boolean(result.data?.confirmationUrl),
        localSubscriptionId: result.data?.localSubscriptionId ?? null,
      });
    }
    return result;
  },
  cancelYookassa(): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient("/api/v1/app-subscription/yookassa/cancel", { method: "POST", body: {} });
  },
  verifyAppleSubscription(body: {
    signedTransactionInfo: string;
  }): Promise<ApiResponse<{ success: true } | { success: false; code: string; error: string }>> {
    return apiClient("/api/v1/app-subscription/apple/verify", { method: "POST", body });
  },
  restoreAppleSubscription(body: {
    originalTransactionId?: string;
    signedTransactionInfo?: string;
  }): Promise<ApiResponse<{ success: true } | { success: false; code: string; error: string }>> {
    return apiClient("/api/v1/app-subscription/apple/restore", { method: "POST", body });
  },
};
