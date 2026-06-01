import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
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

export async function getMobileIosRuCardPaymentFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, false);
}

export async function getAppSubscriptionPaywallFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, true);
}

export async function getAppSubscriptionGatingFlag(): Promise<boolean> {
  return getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true);
}
