"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-cache-actions");

const invalidateUserProgressSchema = z.object({
  userId: z.string().trim().min(1, "userId обязателен"),
  force: z.boolean().optional(),
});

/**
 * Инвалидирует кэш прогресса конкретного пользователя
 * Используется при изменении прогресса пользователя (добавление в избранное,
 * начало шага, обновление статуса шага, назначение курса)
 *
 * @param userId - ID пользователя
 * @param force - Принудительная инвалидация (игнорирует офлайн статус)
 * @returns Результат операции с информацией о статусе
 */
export async function invalidateUserProgressCache(userId: string, force: boolean = false) {
  const { userId: safeUserId } = invalidateUserProgressSchema.parse({
    userId,
    force,
  });

  logger.info(`[Cache] Invalidating user progress cache for user: ${safeUserId}`);

  revalidateTag(`user-${safeUserId}`);
  revalidateTag("user-progress");
  revalidateTag("training");
  revalidateTag("days");
  revalidateTag("courses-favorites");
  revalidateTag("courses");
  revalidateTag("courses-metadata");
  revalidateTag("achievements");
  revalidateTag("streaks");

  logger.success(`[Cache] User progress cache invalidated successfully for user: ${safeUserId}`);
  return { success: true };
}

/**
 * Инвалидирует все кэши курсов
 * Используется при глобальных изменениях (обновление курса, добавление дней)
 */
export async function invalidateCoursesCache() {
  logger.info("[Cache] Invalidating all courses cache");

  revalidateTag("courses");
  revalidateTag("courses-all");
  revalidateTag("courses-all-permanent");
  revalidateTag("courses-favorites");
  revalidateTag("courses-metadata");

  logger.success("[Cache] All courses cache invalidated successfully");
  return { success: true };
}

/**
 * Инвалидирует кэш тренировок
 */
export async function invalidateTrainingCache(userId?: string) {
  logger.info("[Cache] Invalidating training cache", { userId });

  revalidateTag("training");
  revalidateTag("days");

  if (userId) {
    revalidateTag(`user-${userId}`);
  }

  logger.success("[Cache] Training cache invalidated successfully");
  return { success: true };
}
