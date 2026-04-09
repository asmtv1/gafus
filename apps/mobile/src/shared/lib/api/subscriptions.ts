import { apiClient, type ApiResponse } from "./client";

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Статус подписки именно для переданных endpoint'ов (это устройство). */
export interface PushSubscriptionDeviceStatus {
  hasThisDeviceSubscription: boolean;
  determined: boolean;
}

/**
 * API модуль для push подписок
 */
export const subscriptionsApi = {
  /**
   * Есть ли на сервере подписка с одним из endpoint'ов этого устройства (Expo / RuStore).
   * Пустой массив → determined: false.
   */
  postPushDeviceStatus: async (
    endpoints: string[],
  ): Promise<ApiResponse<PushSubscriptionDeviceStatus>> => {
    return apiClient<PushSubscriptionDeviceStatus>(
      "/api/v1/subscriptions/push/device-status",
      {
        method: "POST",
        body: { endpoints },
      },
    );
  },

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

  deleteAllPushSubscriptions: async (): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/subscriptions/push", {
      method: "DELETE",
      body: { deleteAll: true },
    });
  },
};
