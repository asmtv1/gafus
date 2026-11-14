/** iOS-only payment boundary. Intentionally excludes new YooKassa checkout and promo APIs. */
import { apiClient, type ApiResponse } from "@/shared/lib/api/client";
import type { AppSubscriptionOfferDto, AppSubscriptionStatusDto } from "./appSubscriptionApi";

type AppleResult = { success: true } | { success: false; code: string; error: string };

export const appSubscriptionAppleApi = {
  getStatus(requestGuard?: () => boolean): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient("/api/v1/app-subscription/status", { requestGuard });
  },
  getOffer(requestGuard?: () => boolean): Promise<ApiResponse<AppSubscriptionOfferDto>> {
    return apiClient("/api/v1/app-subscription/offer", { requestGuard });
  },
  initializeAppleAppAccountToken(requestGuard: () => boolean): Promise<ApiResponse<{ appleAppAccountToken: string }>> {
    return apiClient("/api/v1/app-subscription/apple/token/initialize", {
      method: "POST", body: {}, requestGuard,
    });
  },
  verifyAppleSubscription(
    body: { signedTransactionInfo: string }, requestGuard?: () => boolean,
  ): Promise<ApiResponse<AppleResult>> {
    return apiClient("/api/v1/app-subscription/apple/verify", { method: "POST", body, requestGuard });
  },
  restoreAppleSubscription(
    body: { originalTransactionId?: string; signedTransactionInfo?: string },
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<AppleResult>> {
    return apiClient("/api/v1/app-subscription/apple/restore", { method: "POST", body, requestGuard });
  },
  /** Management of an existing YooKassa subscription is permitted on iOS. */
  cancelExistingYookassaRenewal(requestGuard?: () => boolean): Promise<ApiResponse<AppSubscriptionStatusDto>> {
    return apiClient("/api/v1/app-subscription/yookassa/cancel", { method: "POST", body: {}, requestGuard });
  },
};
