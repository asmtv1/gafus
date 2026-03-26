import { prisma } from "@gafus/prisma";

/** Вход через VK на iOS в мобильном приложении (управляется из админ-панели). */
export const APP_FEATURE_MOBILE_VK_LOGIN_IOS = "mobile_vk_login_ios";

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
export async function getMobileAppPublicConfig(): Promise<{ vkLoginEnabledOnIos: boolean }> {
  const vkLoginEnabledOnIos = await getAppFeatureFlagEnabled(
    APP_FEATURE_MOBILE_VK_LOGIN_IOS,
    false,
  );
  return { vkLoginEnabledOnIos };
}
