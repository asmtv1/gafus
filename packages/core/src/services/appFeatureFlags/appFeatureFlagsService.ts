import { prisma } from "@gafus/prisma";

/** Вход через VK на iOS в мобильном приложении (управляется из админ-панели). */
export const APP_FEATURE_MOBILE_VK_LOGIN_IOS = "mobile_vk_login_ios";
/** Подсказка про оплату картами РФ на iOS в карточках платных курсов. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT = "mobile_ios_ru_card_payment_hint";
/** Кнопка оплаты картой РФ на iOS paywall. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment";
/** Включает автоматический показ paywall подписки в клиентах. */
export const APP_FEATURE_APP_SUBSCRIPTION_PAYWALL = "app_subscription_paywall_enabled";
/** Включает server-side блокировку платных действий без подписки. */
export const APP_FEATURE_APP_SUBSCRIPTION_GATING = "app_subscription_gating_enabled";

/**
 * Читает булев флаг. Если записи нет — defaultEnabled.
 */
export async function getAppFeatureFlagEnabled(
  key: string,
  defaultEnabled = false,
): Promise<boolean> {
  const row = await prisma.appFeatureFlag.findUnique({
    where: { key },
    select: { enabled: true },
  });
  return row?.enabled ?? defaultEnabled;
}

/**
 * Создаёт или обновляет флаг (только из доверенного серверного кода / админки).
 */
export async function setAppFeatureFlagEnabled(key: string, enabled: boolean): Promise<void> {
  await prisma.appFeatureFlag.upsert({
    where: { key },
    create: { key, enabled },
    update: { enabled },
  });
}

/**
 * Публичные настройки мобильного клиента для экрана welcome / логина.
 */
export async function getMobileAppPublicConfig(): Promise<{
  vkLoginEnabledOnIos: boolean;
  appSubscriptionPaywallEnabled: boolean;
  appSubscriptionGatingEnabled: boolean;
  iosRuCardPaymentEnabled: boolean;
  iosRuCardPaymentHintEnabled: boolean;
}> {
  const vkLoginEnabledOnIos = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_VK_LOGIN_IOS,
    false,
  );
  const appSubscriptionPaywallEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
    true,
  );
  const appSubscriptionGatingEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );
  const iosRuCardPaymentHintEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
    false,
  );
  const iosRuCardPaymentEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
    false,
  );
  return {
    vkLoginEnabledOnIos,
    appSubscriptionPaywallEnabled,
    appSubscriptionGatingEnabled,
    iosRuCardPaymentEnabled,
    iosRuCardPaymentHintEnabled,
  };
}
