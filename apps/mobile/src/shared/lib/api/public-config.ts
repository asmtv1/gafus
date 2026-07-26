import { apiClient, type ApiResponse } from "./client";

export interface MobileAppPublicConfig {
  vkLoginEnabledOnIos: boolean;
  appSubscriptionPaywallEnabled: boolean;
  appSubscriptionGatingEnabled: boolean;
  iosRuCardPaymentEnabled: boolean;
  iosRuCardPaymentHintEnabled: boolean;
  resolvedFeatureProfile?: "RELEASED" | "REVIEW";
  resolvedClientVersion?: string | null;
  minimumSupportedVersion?: {
    ios?: string;
    android?: string;
  };
  storeUrl?: {
    ios?: string;
    android?: string;
  };
}

/**
 * Публичные настройки мобильного клиента (без JWT).
 */
export async function fetchMobileAppPublicConfig(): Promise<ApiResponse<MobileAppPublicConfig>> {
  return apiClient<MobileAppPublicConfig>("/api/v1/public/mobile-app", {
    skipAuth: true,
    timeoutMs: 5_000,
  });
}
