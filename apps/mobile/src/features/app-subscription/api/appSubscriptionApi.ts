import type { AppSubscriptionPlanCode as CanonicalAppSubscriptionPlanCode, AppSubscriptionStatusDto as CanonicalStatus, LegacyMobileSubscriptionPlanOffer, LegacyMobileSubscriptionOffer } from "@gafus/types";
import { apiClient, type ApiResponse } from "@/shared/lib/api/client";
import { getMobileClientHeaders } from "@/shared/lib/api/client-context";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

/** The old client billing code intentionally excludes retired weekly offers. */
export type AppSubscriptionPlanCode = Exclude<CanonicalAppSubscriptionPlanCode, "WEEKLY">;
export type AppSubscriptionStatusDto = Omit<CanonicalStatus, "planCode"> & { planCode: AppSubscriptionPlanCode | null };
export type AppSubscriptionPlanBadge = AppSubscriptionPlanOfferDto["badge"];
export type AppSubscriptionPlanOfferDto = LegacyMobileSubscriptionPlanOffer;
export type AppSubscriptionOfferDto = LegacyMobileSubscriptionOffer;

import type { AppSubscriptionPromoCodePreviewDto } from "@gafus/types";
export type { AppSubscriptionPromoCodePreviewDto } from "@gafus/types";

export const appSubscriptionApi = {
  getStatus(): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient<AppSubscriptionStatusDto>("/api/v1/app-subscription/status");
  },
  async getOffer(requestGuard?: () => boolean): Promise<ApiResponse<AppSubscriptionOfferDto>> {
    if (isDev) {
      const headers = getMobileClientHeaders();
      console.log("[appSubscriptionApi] offer request context", {
        clientPlatform: headers["X-Client-Platform"] ?? null,
        clientVersion: headers["X-Client-Version"] ?? null,
      });
    }
    const result = await apiClient<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer", {
      ...(requestGuard ? { requestGuard } : {}),
    });
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
  /**
   * AG4 Phase-A SOURCE/MOCK-only grant (not mounted in the live paywall).
   * Exactly one authenticated POST; the server mints and persists the token.
   * Never send a caller ownerId, token, or payment details in this body.
   */
  initializeAppleAppAccountToken(
    requestGuard: () => boolean,
  ): Promise<ApiResponse<{ appleAppAccountToken: string }>> {
    return apiClient<{ appleAppAccountToken: string }>(
      "/api/v1/app-subscription/apple/token/initialize",
      { method: "POST", body: {}, requestGuard },
    );
  },
  async startYookassa(
    planCode: AppSubscriptionPlanCode,
    promoCode?: { code: string; revision: number },
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ confirmationUrl: string; localSubscriptionId: string }>> {
    if (isDev) console.log("[appSubscriptionApi] startYookassa request", { planCode });
    const result = await apiClient<{ confirmationUrl: string; localSubscriptionId: string }>(
      "/api/v1/app-subscription/yookassa/start",
      {
        method: "POST",
        body: { planCode, ...(promoCode ? { promoCode } : {}) },
        ...(requestGuard ? { requestGuard } : {}),
      },
    );
    if (isDev) {
      console.log("[appSubscriptionApi] startYookassa response", {
        success: result.success,
        code: result.code,
        hasConfirmationUrl: Boolean(result.data?.confirmationUrl),
        hasLocalSubscriptionId: Boolean(result.data?.localSubscriptionId),
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
