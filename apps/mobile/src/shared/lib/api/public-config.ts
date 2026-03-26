import { apiClient, type ApiResponse } from "./client";

export interface MobileAppPublicConfig {
  vkLoginEnabledOnIos: boolean;
}

/**
 * Публичные настройки мобильного клиента (без JWT).
 */
export async function fetchMobileAppPublicConfig(): Promise<
  ApiResponse<MobileAppPublicConfig>
> {
  return apiClient<MobileAppPublicConfig>("/api/v1/public/mobile-app", { skipAuth: true });
}
