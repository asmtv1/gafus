import { apiClient, type ApiResponse } from "@/shared/lib/api/client";

export type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  paidAt: string | null;
  activeUntil: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  isLifetime: boolean;
  provider: "YOOKASSA" | "APPLE" | "MANUAL" | null;
  status: "ACTIVE" | "PENDING" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "REFUNDED" | "REVOKED" | null;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
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
};

export const appSubscriptionApi = {
  getStatus(): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient<AppSubscriptionStatusDto>("/api/v1/app-subscription/status");
  },
  getOffer(): Promise<ApiResponse<AppSubscriptionOfferDto>> {
    return apiClient<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer");
  },
  startYookassa(): Promise<ApiResponse<{ confirmationUrl: string; localSubscriptionId: string }>> {
    return apiClient("/api/v1/app-subscription/yookassa/start", { method: "POST", body: {} });
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
