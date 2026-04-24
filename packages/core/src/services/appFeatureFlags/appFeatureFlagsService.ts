import { prisma } from "@gafus/prisma";

/** Вход через VK на iOS в мобильном приложении (управляется из админ-панели). */
export const APP_FEATURE_MOBILE_VK_LOGIN_IOS = "mobile_vk_login_ios";
/** Подсказка про оплату картами РФ на iOS в карточках платных курсов. */
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT = "mobile_ios_ru_card_payment_hint";

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
  iosRuCardPaymentHintEnabled: boolean;
}> {
  const vkLoginEnabledOnIos = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_VK_LOGIN_IOS,
    false,
  );
  const iosRuCardPaymentHintEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
    false,
  );
  return { vkLoginEnabledOnIos, iosRuCardPaymentHintEnabled };
}
