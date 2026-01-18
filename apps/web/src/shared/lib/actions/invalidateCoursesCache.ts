"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('web-invalidate-courses-cache');

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
  
  logger.warn(`[Cache] Invalidating user progress cache for user: ${safeUserId}`, { operation: 'warn' });

  revalidateTag(`user-${safeUserId}`);
  revalidateTag("user-progress");
  revalidateTag("training");
  revalidateTag("days");
  revalidateTag("courses-favorites");
  revalidateTag("courses");
  revalidateTag("courses-metadata");
  revalidateTag("achievements");
  revalidateTag("streaks");

  logger.warn(`[Cache] User progress cache invalidated successfully for user: ${safeUserId}`, { operation: 'warn' });
  return { success: true };
}
