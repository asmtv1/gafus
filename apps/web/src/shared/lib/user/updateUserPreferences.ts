"use server";

import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import type { UserPreferences } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function updateUserPreferences(
  preferences: Partial<UserPreferences>,
): Promise<UserPreferences | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Пользователь не авторизован");

    // Пока что просто возвращаем обновленные настройки
    // В будущем можно добавить сохранение в БД
    console.warn("Обновление настроек пользователя:", preferences);

    // Возвращаем обновленные настройки
    return {
      notifications: {
        push: true,
        email: false,
        sms: false,
        ...preferences.notifications,
      },
      sound: {
        enabled: true,
        volume: 0.7,
        trainingSounds: true,
        achievementSounds: true,
        ...preferences.sound,
      },
      interface: {
        autoPlay: false,
        showProgress: true,
        showTips: true,
        compactMode: false,
        ...preferences.interface,
      },
      privacy: {
        showProfile: true,
        showProgress: true,
        allowAnalytics: true,
        ...preferences.privacy,
      },
    };
  } catch (error) {
    console.error("Ошибка в updateUserPreferences:", error);

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in updateUserPreferences",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "updateUserPreferences",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        preferences,
      },
      tags: ["user", "preferences", "server-action"],
    });

    throw new Error("Ошибка при обновлении настроек");
  }
}
