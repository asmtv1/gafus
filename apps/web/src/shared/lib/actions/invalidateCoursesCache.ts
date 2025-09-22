"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";

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
  const { userId: safeUserId, force: safeForce = false } = invalidateUserProgressSchema.parse({
    userId,
    force,
  });
  try {
    // Проверяем онлайн статус через офлайн-store (если на клиенте)
    let isOnline = true;
    if (typeof window !== "undefined") {
      try {
        const { useOfflineStore } = await import("@shared/stores/offlineStore");
        isOnline = useOfflineStore.getState().isOnline;
      } catch {
        isOnline = navigator.onLine;
      }
    }
    
    if (!safeForce && !isOnline) {
      console.warn(`[Cache] Skipping cache invalidation - user is offline (userId: ${safeUserId})`);
      
      // Добавляем действие в очередь синхронизации для выполнения при восстановлении соединения
      try {
        const { addToSyncQueue, createCacheInvalidationAction } = await import(
          "@shared/utils/offlineCacheUtils"
        );
        
        const action = createCacheInvalidationAction(safeUserId, [
          `user-${safeUserId}`,
          "user-progress", 
          "training", 
          "days",
          "courses-favorites",
          "courses"
        ]);
        
        addToSyncQueue(action);
      console.warn(`[Cache] Cache invalidation action queued for offline sync (userId: ${safeUserId})`);
      } catch (error) {
        console.warn("[Cache] Failed to queue cache invalidation action:", error);
      }
      
      return { 
        success: true, 
        skipped: true, 
        reason: "offline",
        queued: true
      };
    }
    
    console.warn(`[Cache] Invalidating user progress cache for user: ${safeUserId} (force: ${safeForce}, online: ${isOnline})`);

    revalidateTag(`user-${safeUserId}`);
    revalidateTag("user-progress");
    revalidateTag("training"); // Инвалидируем кэш дней тренировок
    revalidateTag("days"); // Инвалидируем кэш дней тренировок
    revalidateTag("courses-favorites"); // Инвалидируем кэш избранных курсов
    revalidateTag("courses"); // Инвалидируем общий кэш курсов
    
    console.warn(`[Cache] User progress cache invalidated successfully for user: ${safeUserId}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Error invalidating user progress cache:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
