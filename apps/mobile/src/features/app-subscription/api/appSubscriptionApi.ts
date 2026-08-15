import { apiClient, type ApiResponse } from "@/shared/lib/api/client";
import { getMobileClientHeaders } from "@/shared/lib/api/client-context";

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
  /** @deprecated New trials are disabled; retained for older API compatibility. */
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: number;
  /** @deprecated New trials are disabled; retained for older API compatibility. */
  yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED" | null;
};

export type AppSubscriptionPlanCode = "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
export type AppSubscriptionPlanBadge = "TRY" | "POPULAR" | "MAX_SAVINGS" | null;

export type AppSubscriptionPlanOfferDto = {
  code: AppSubscriptionPlanCode;
  label: string;
  title: string;
  intervalDays: number;
  currency: "RUB";
  yookassaPriceRub: number;
  enabled: boolean;
  appleProductId: string | null;
  consultationBookingIncluded: boolean;
  promoCodeEligible: boolean;
  badge: AppSubscriptionPlanBadge;
  savingsRub: number | null;
};

export type AppSubscriptionOfferDto = {
  /** Legacy fallback for clients released before the multi-period YooKassa offer. */
  plans: AppSubscriptionPlanOfferDto[];
  yookassaPlans: AppSubscriptionPlanOfferDto[];
  applePlan: AppSubscriptionPlanOfferDto | null;
  appleAppAccountToken: string | null;
  iosRuCardPaymentEnabled: boolean;
  promoCode: {
    entryEnabled: boolean;
    eligible: boolean;
  };
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

export const appSubscriptionApi = {
  getStatus(): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient<AppSubscriptionStatusDto>("/api/v1/app-subscription/status");
  },
  async getOffer(): Promise<ApiResponse<AppSubscriptionOfferDto>> {
    if (isDev) {
      const headers = getMobileClientHeaders();
      console.log("[appSubscriptionApi] offer request context", {
        clientPlatform: headers["X-Client-Platform"] ?? null,
        clientVersion: headers["X-Client-Version"] ?? null,
      });
    }
    const result = await apiClient<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer");
    if (isDev) {
      console.log("[appSubscriptionApi] offer response", {
        success: result.success,
        iosRuCardPaymentEnabled: result.data?.iosRuCardPaymentEnabled ?? null,
        error: result.error ?? null,
        code: result.code ?? null,
      });
    }
    return result;
  },
  async startYookassa(
    planCode: AppSubscriptionPlanCode,
    promoCode?: { code: string; revision: number },
  ): Promise<ApiResponse<{ confirmationUrl: string; localSubscriptionId: string }>> {
    if (isDev) console.log("[appSubscriptionApi] startYookassa request", { planCode });
    const result = await apiClient<{ confirmationUrl: string; localSubscriptionId: string }>(
      "/api/v1/app-subscription/yookassa/start",
      { method: "POST", body: { planCode, ...(promoCode ? { promoCode } : {}) } },
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
  previewPromoCode(
    planCode: AppSubscriptionPlanCode,
    promoCode: string,
  ): Promise<ApiResponse<AppSubscriptionPromoCodePreviewDto>> {
    return apiClient<AppSubscriptionPromoCodePreviewDto>(
      "/api/v1/app-subscription/promo-code/preview",
      { method: "POST", body: { planCode, promoCode } },
    );
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
