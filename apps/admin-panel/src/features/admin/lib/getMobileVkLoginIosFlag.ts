import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  getAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";

/**
 * Текущее значение флага «VK на iOS» для страницы администрирования.
 */
export async function getMobileVkLoginIosFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_MOBILE_VK_LOGIN_IOS, false);
}

/**
 * Текущее значение флага «Оплата картами РФ на сайте» для iOS в карточках платных курсов.
 */
export async function getMobileIosRuCardPaymentHintFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT, false);
}
