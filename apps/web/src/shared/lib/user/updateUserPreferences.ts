"use server";

import { z } from "zod";

import { createWebLogger } from "@gafus/logger";

import type { UserPreferences } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

const logger = createWebLogger('web');

const userPreferencesSchema = z.object({
  notifications: z
    .object({
      push: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
    })
    .partial(),
  sound: z
    .object({
      enabled: z.boolean(),
      volume: z.number().min(0).max(1),
      trainingSounds: z.boolean(),
      achievementSounds: z.boolean(),
    })
    .partial(),
  interface: z
    .object({
      autoPlay: z.boolean(),
      showProgress: z.boolean(),
      showTips: z.boolean(),
      compactMode: z.boolean(),
    })
    .partial(),
  privacy: z
    .object({
      showProfile: z.boolean(),
      showProgress: z.boolean(),
      allowAnalytics: z.boolean(),
    })
    .partial(),
});

export async function updateUserPreferences(
  preferences: Partial<UserPreferences>,
): Promise<UserPreferences | null> {
  const safePreferences = userPreferencesSchema.partial().parse(preferences ?? {});
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Пользователь не авторизован");

    // Пока что просто возвращаем обновленные настройки
    // В будущем можно добавить сохранение в БД
    logger.warn("Обновление настроек пользователя:", { preferences: safePreferences, operation: 'warn' });

    // Возвращаем обновленные настройки
    return {
      notifications: {
        push: true,
        email: false,
        sms: false,
        ...safePreferences.notifications,
      },
      sound: {
        enabled: true,
        volume: 0.7,
        trainingSounds: true,
        achievementSounds: true,
        ...safePreferences.sound,
      },
      interface: {
        autoPlay: false,
        showProgress: true,
        showTips: true,
        compactMode: false,
        ...safePreferences.interface,
      },
      privacy: {
        showProfile: true,
        showProgress: true,
        allowAnalytics: true,
        ...safePreferences.privacy,
      },
    };
  } catch (error) {
    logger.error("Ошибка в updateUserPreferences:", error as Error, { operation: 'error' });

    logger.error(
      error instanceof Error ? error.message : "Unknown error in updateUserPreferences",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "updateUserPreferences",
        action: "updateUserPreferences",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        preferences: safePreferences,
        tags: ["user", "preferences", "server-action"],
      }
    );

    throw new Error("Ошибка при обновлении настроек");
  }
}
