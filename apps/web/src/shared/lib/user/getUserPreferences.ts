"use server";

import { createWebLogger } from "@gafus/logger";

import type { UserPreferences } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web");

export async function getUserPreferences(): Promise<UserPreferences | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    // Пока что возвращаем дефолтные настройки
    // В будущем можно добавить таблицу user_preferences в БД
    return {
      notifications: {
        push: true,
        email: false,
        sms: false,
      },
      sound: {
        enabled: true,
        volume: 0.7,
        trainingSounds: true,
        achievementSounds: true,
      },
      interface: {
        autoPlay: false,
        showProgress: true,
        showTips: true,
        compactMode: false,
      },
      privacy: {
        showProfile: true,
        showProgress: true,
        allowAnalytics: true,
      },
    };
  } catch (error) {
    logger.error("Ошибка в getUserPreferences:", error as Error, { operation: "error" });

    logger.error(
      error instanceof Error ? error.message : "Unknown error in getUserPreferences",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "getUserPreferences",
        action: "getUserPreferences",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["user", "preferences", "server-action"],
      },
    );

    return null;
  }
}
