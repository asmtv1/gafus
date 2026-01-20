import { apiClient, type ApiResponse } from "./client";

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * API модуль для push подписок
 */
export const subscriptionsApi = {
  /**
   * Сохранить push подписку (Expo Push Token)
   */
  savePushSubscription: async (data: PushSubscription): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/subscriptions/push", {
      method: "POST",
      body: data,
    });
  },

  /**
   * Удалить push подписку
   */
  deletePushSubscription: async (endpoint: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/subscriptions/push", {
      method: "DELETE",
      body: { endpoint },
    });
  },
};
