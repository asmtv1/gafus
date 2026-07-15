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

const CURRENT_MOBILE_VERSION = "1.5.6";
const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/ru/app/gafus/id6760964612";
const DEFAULT_ANDROID_STORE_URL = "https://www.rustore.ru/catalog/app/ru.gafus.app";
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function getConfiguredVersion(value: string | undefined): string {
  const version = value?.trim();
  return version && SEMANTIC_VERSION_PATTERN.test(version) ? version : CURRENT_MOBILE_VERSION;
}

function getConfiguredStoreUrl(value: string | undefined, fallback: string): string {
  const url = value?.trim();
  return url?.startsWith("https://") ? url : fallback;
}

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
  minimumSupportedVersion: {
    ios: string;
    android: string;
  };
  storeUrl: {
    ios: string;
    android: string;
  };
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
    minimumSupportedVersion: {
      ios: getConfiguredVersion(process.env.MOBILE_IOS_MIN_VERSION),
      android: getConfiguredVersion(process.env.MOBILE_ANDROID_MIN_VERSION),
    },
    storeUrl: {
      ios: getConfiguredStoreUrl(process.env.MOBILE_IOS_STORE_URL, DEFAULT_IOS_STORE_URL),
      android: getConfiguredStoreUrl(
        process.env.MOBILE_ANDROID_STORE_URL,
        DEFAULT_ANDROID_STORE_URL,
      ),
    },
  };
}
