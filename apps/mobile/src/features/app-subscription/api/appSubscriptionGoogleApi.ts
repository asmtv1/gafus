import { apiClient } from "@/shared/lib/api/client";
import type { AppSubscriptionStatusDto } from "./appSubscriptionApi";

const path = "/api/v1/app-subscription";
export type GooglePlayPlan = { productId: string; basePlanId: string; planCode: "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS" };

export const appSubscriptionGoogleApi = {
  getStatus(requestGuard?: () => boolean) {
    return apiClient<AppSubscriptionStatusDto>(path + "/status", { requestGuard });
  },
  prepare(requestGuard: () => boolean) {
    return apiClient<{ accountId: string; plans: GooglePlayPlan[] }>(path + "/google/play/prepare", {
      method: "POST", body: {}, requestGuard,
    });
  },
  verify(purchaseToken: string, requestGuard: () => boolean) {
    return apiClient<{ entitled: boolean; pending: boolean }>(path + "/google/play/verify", {
      method: "POST", body: { purchaseToken }, requestGuard, skipAuthRefreshReplay: true,
    });
  },
  cancelExistingYookassaRenewal(requestGuard: () => boolean) {
    return apiClient<AppSubscriptionStatusDto>(path + "/yookassa/cancel", { method: "POST", body: {}, requestGuard });
  },
};
