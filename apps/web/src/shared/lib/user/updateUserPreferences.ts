"use server";

import { z } from "zod";

import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import type { UserPreferences } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

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
    console.warn("Обновление настроек пользователя:", safePreferences);

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
    console.error("Ошибка в updateUserPreferences:", error);

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in updateUserPreferences",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "updateUserPreferences",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        preferences: safePreferences,
      },
      tags: ["user", "preferences", "server-action"],
    });

    throw new Error("Ошибка при обновлении настроек");
  }
}
