"use server";

import { revalidateTag } from "next/cache";

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
    
    if (!force && !isOnline) {
      console.warn(`[Cache] Skipping cache invalidation - user is offline (userId: ${userId})`);
      
      // Добавляем действие в очередь синхронизации для выполнения при восстановлении соединения
      try {
        const { addToSyncQueue, createCacheInvalidationAction } = await import(
          "@shared/utils/offlineCacheUtils"
        );
        
        const action = createCacheInvalidationAction(userId, [
          `user-${userId}`,
          "user-progress", 
          "training", 
          "days"
        ]);
        
        addToSyncQueue(action);
        console.warn(`[Cache] Cache invalidation action queued for offline sync (userId: ${userId})`);
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
    
    console.warn(`[Cache] Invalidating user progress cache for user: ${userId} (force: ${force}, online: ${isOnline})`);
    
    revalidateTag(`user-${userId}`);
    revalidateTag("user-progress");
    revalidateTag("training"); // Инвалидируем кэш дней тренировок
    revalidateTag("days"); // Инвалидируем кэш дней тренировок
    
    console.warn(`[Cache] User progress cache invalidated successfully for user: ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Error invalidating user progress cache:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

