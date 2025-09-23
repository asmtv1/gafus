"use server";

import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { createWebLogger } from "@gafus/logger";

import type { UserPreferences } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

const logger = createWebLogger('web');

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
    logger.error("Ошибка в getUserPreferences:", error as Error, { operation: 'error' });

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in getUserPreferences",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "getUserPreferences",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["user", "preferences", "server-action"],
    });

    return null;
  }
}
