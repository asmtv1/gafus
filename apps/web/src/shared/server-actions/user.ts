"use server";

/**
 * Server Actions для работы с пользователем и профилем
 */

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import {
  getUserProfile as getUserProfileService,
  updateUserProfile as updateUserProfileService,
  getPublicProfile as getPublicProfileService,
  updateAvatar as updateAvatarService,
  getUserPreferences as getUserPreferencesService,
  updateUserPreferences as updateUserPreferencesService,
} from "@gafus/core/services/user";

import { normalizeTelegramInput, normalizeInstagramInput, normalizeWebsiteUrl } from "@gafus/core/utils/social";
import type { UpdateUserProfileInput, UserPreferences } from "@gafus/types";

const logger = createWebLogger('user-server-actions');

// ========== Schemas ==========

const updateUserProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  about: z.string().trim().max(2000).optional(),
  telegram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeTelegramInput(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['telegram'],
          message: error instanceof Error ? error.message : 'Некорректный Telegram username'
        }]);
      }
    }),
  instagram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeInstagramInput(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['instagram'],
          message: error instanceof Error ? error.message : 'Некорректный Instagram username'
        }]);
      }
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val) => {
      if (!val) return '';
      try {
        return normalizeWebsiteUrl(val);
      } catch (error) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['website'],
          message: error instanceof Error ? error.message : 'Некорректный URL'
        }]);
      }
    }),
  birthDate: z.string().trim().max(100).optional(),
});

const userPreferencesSchema = z.object({
  notifications: z
    .object({
      push: z.boolean(),
      email: z.boolean(),
      sms: z.boolean(),
    })
    .partial()
    .optional(),
  sound: z
    .object({
      enabled: z.boolean(),
      volume: z.number().min(0).max(1),
      trainingSounds: z.boolean(),
      achievementSounds: z.boolean(),
    })
    .partial()
    .optional(),
  interface: z
    .object({
      autoPlay: z.boolean(),
      showProgress: z.boolean(),
      showTips: z.boolean(),
      compactMode: z.boolean(),
    })
    .partial()
    .optional(),
  privacy: z
    .object({
      showProfile: z.boolean(),
      showProgress: z.boolean(),
      allowAnalytics: z.boolean(),
    })
    .partial()
    .optional(),
});

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

// ========== Profile Actions ==========

/**
 * Получает профиль текущего пользователя
 */
export async function getUserProfileAction() {
  try {
    // Используем auth напрямую - возвращает null для неавторизованных без выброса ошибки
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      return null;
    }
    return getUserProfileService(userId);
  } catch (error) {
    logger.error("Ошибка в getUserProfile", error as Error);
    return null;
  }
}

/**
 * Обновляет профиль текущего пользователя
 */
export async function updateUserProfileAction(data: UpdateUserProfileInput) {
  const validatedInput = updateUserProfileSchema.parse(data);
  try {
    const userId = await getCurrentUserId();
    return updateUserProfileService(userId, validatedInput);
  } catch (error) {
    logger.error("Ошибка в updateUserProfile", error as Error);
    throw new Error("Ошибка при обновлении профиля. Попробуйте перезагрузить страницу.");
  }
}

/**
 * Получает публичный профиль по username
 */
export async function getPublicProfileAction(username: string) {
  const safeUsername = z.string().trim().min(1).parse(username);
  try {
    return getPublicProfileService(safeUsername);
  } catch (error) {
    logger.error("Ошибка в getPublicProfile", error as Error);
    throw new Error("Не удалось загрузить публичный профиль");
  }
}

/**
 * Обновляет аватар текущего пользователя
 */
export async function updateAvatarAction(file: File): Promise<string> {
  const validFile = fileSchema.parse(file);
  try {
    const userId = await getCurrentUserId();
    return updateAvatarService(userId, validFile);
  } catch (error) {
    logger.error("Ошибка в updateAvatar", error as Error);
    throw new Error("Ошибка при обновлении аватара. Попробуйте перезагрузить страницу.");
  }
}

// ========== Preferences Actions ==========

/**
 * Получает настройки текущего пользователя
 */
export async function getUserPreferencesAction(): Promise<UserPreferences | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    return getUserPreferencesService(userId);
  } catch (error) {
    logger.error("Ошибка в getUserPreferences", error as Error);
    return null;
  }
}

/**
 * Обновляет настройки текущего пользователя
 */
export async function updateUserPreferencesAction(
  preferences: Record<string, unknown>
): Promise<UserPreferences | null> {
  const safePreferences = userPreferencesSchema.parse(preferences ?? {});
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Пользователь не авторизован");
    return updateUserPreferencesService(userId, safePreferences as Parameters<typeof updateUserPreferencesService>[1]);
  } catch (error) {
    logger.error("Ошибка в updateUserPreferences", error as Error);
    throw new Error("Ошибка при обновлении настроек");
  }
}
