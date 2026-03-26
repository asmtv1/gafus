import {
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  getAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";

/**
 * Текущее значение флага «VK на iOS» для страницы администрирования.
 */
export async function getMobileVkLoginIosFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_MOBILE_VK_LOGIN_IOS, false);
}
