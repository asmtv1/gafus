"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  setAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("admin-mobile-app-flags");

const enabledSchema = z.boolean();

/**
 * Включает или отключает кнопку «Продолжить через VK» на iOS в мобильном приложении.
 */
export async function setMobileVkLoginOnIosAction(
  enabled: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!session.user.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав для изменения настроек" };
    }

    const parsed = enabledSchema.safeParse(enabled);
    if (!parsed.success) {
      return { success: false, error: "Некорректное значение" };
    }

    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_VK_LOGIN_IOS, parsed.data);
    logger.success("mobile_vk_login_ios updated", {
      enabled: parsed.data,
      actorId: session.user.id,
    });
    return { success: true };
  } catch (error) {
    logger.error("setMobileVkLoginOnIosAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

/**
 * Включает или отключает подсказку об оплате картами РФ на сайте для iOS в платных курсах.
 */
export async function setMobileIosRuCardPaymentHintAction(
  enabled: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!session.user.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав для изменения настроек" };
    }

    const parsed = enabledSchema.safeParse(enabled);
    if (!parsed.success) {
      return { success: false, error: "Некорректное значение" };
    }

    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT, parsed.data);
    logger.success("mobile_ios_ru_card_payment_hint updated", {
      enabled: parsed.data,
      actorId: session.user.id,
    });
    return { success: true };
  } catch (error) {
    logger.error("setMobileIosRuCardPaymentHintAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

export async function setAppSubscriptionPaywallEnabledAction(
  enabled: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!session.user.role || session.user.role !== "ADMIN") {
      return { success: false, error: "Недостаточно прав для изменения настроек" };
    }

    const parsed = enabledSchema.safeParse(enabled);
    if (!parsed.success) {
      return { success: false, error: "Некорректное значение" };
    }

    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, parsed.data);
    logger.success("app_subscription_paywall_enabled updated", {
      enabled: parsed.data,
      actorId: session.user.id,
    });
    return { success: true };
  } catch (error) {
    logger.error("setAppSubscriptionPaywallEnabledAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

export async function setAppSubscriptionGatingEnabledAction(
  enabled: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!session.user.role || session.user.role !== "ADMIN") {
      return { success: false, error: "Недостаточно прав для изменения настроек" };
    }

    const parsed = enabledSchema.safeParse(enabled);
    if (!parsed.success) {
      return { success: false, error: "Некорректное значение" };
    }

    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, parsed.data);
    logger.success("app_subscription_gating_enabled updated", {
      enabled: parsed.data,
      actorId: session.user.id,
    });
    return { success: true };
  } catch (error) {
    logger.error("setAppSubscriptionGatingEnabledAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

export async function setMobileIosRuCardPaymentEnabledAction(
  enabled: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (!session.user.role || session.user.role !== "ADMIN") {
      return { success: false, error: "Недостаточно прав для изменения настроек" };
    }

    const parsed = enabledSchema.safeParse(enabled);
    if (!parsed.success) {
      return { success: false, error: "Некорректное значение" };
    }

    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, parsed.data);
    logger.success("mobile_ios_ru_card_payment updated", {
      enabled: parsed.data,
      actorId: session.user.id,
    });
    return { success: true };
  } catch (error) {
    logger.error("setMobileIosRuCardPaymentEnabledAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}
