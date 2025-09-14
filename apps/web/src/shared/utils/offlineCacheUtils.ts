"use client";

import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Утилиты для работы с офлайн кэшем
 */

/**
 * Проверяет, находится ли пользователь в офлайн режиме
 */
export function isOffline(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const state = useOfflineStore.getState();
    return !state.isOnline;
  } catch {
    return !navigator.onLine;
  }
}

/**
 * Проверяет, находится ли пользователь в онлайн режиме
 */
export function isOnline(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const state = useOfflineStore.getState();
    return state.isOnline;
  } catch {
    return navigator.onLine;
  }
}

/**
 * Безопасно инвалидирует кэш с учетом офлайн статуса
 * 
 * @param invalidateFunction - Функция инвалидации кэша
 * @param force - Принудительная инвалидация (игнорирует офлайн статус)
 * @returns Результат операции
 */
export async function safeInvalidateCache(
  invalidateFunction: () => Promise<{ success: boolean; skipped?: boolean; reason?: string }>,
  force: boolean = false
): Promise<{ success: boolean; skipped?: boolean; reason?: string; error?: string }> {
  try {
    // Если не принудительная инвалидация и мы офлайн
    if (!force && isOffline()) {
      console.warn("[OfflineCache] Skipping cache invalidation - offline mode");
      return { 
        success: true, 
        skipped: true, 
        reason: "offline" 
      };
    }

    // Выполняем инвалидацию
    const result = await invalidateFunction();
    return { ...result };
  } catch (error) {
    console.error("[OfflineCache] Error during cache invalidation:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Добавляет действие в очередь синхронизации для выполнения при восстановлении соединения
 * 
 * @param action - Действие для синхронизации
 */
export function addToSyncQueue(action: { type: "cache-invalidation"; data: { userId: string; cacheKeys: string[] }; maxRetries: number }) {
  try {
    const offlineStore = useOfflineStore.getState();
    offlineStore.addToSyncQueue(action);
    console.warn("[OfflineCache] Action added to sync queue:", action.type);
  } catch (error) {
    console.error("[OfflineCache] Failed to add action to sync queue:", error);
  }
}

/**
 * Выполняет синхронизацию очереди при восстановлении соединения
 */
export async function syncOfflineQueue() {
  try {
    const offlineStore = useOfflineStore.getState();
    if (offlineStore.syncQueue.length > 0) {
      console.warn("[OfflineCache] Starting offline queue sync...");
      await offlineStore.syncOfflineActions();
    }
  } catch (error) {
    console.error("[OfflineCache] Failed to sync offline queue:", error);
  }
}

/**
 * Очищает очередь синхронизации
 */
export function clearSyncQueue() {
  try {
    const offlineStore = useOfflineStore.getState();
    offlineStore.clearSyncQueue();
    console.warn("[OfflineCache] Sync queue cleared");
  } catch (error) {
    console.error("[OfflineCache] Failed to clear sync queue:", error);
  }
}

/**
 * Получает статус очереди синхронизации
 */
export function getSyncQueueStatus() {
  try {
    const offlineStore = useOfflineStore.getState();
    return {
      isOnline: offlineStore.isOnline,
      queueLength: offlineStore.syncQueue.length,
      lastSyncTime: offlineStore.lastSyncTime,
      syncErrors: offlineStore.syncErrors,
    };
  } catch (error) {
    console.error("[OfflineCache] Failed to get sync queue status:", error);
    return {
      isOnline: true,
      queueLength: 0,
      lastSyncTime: null,
      syncErrors: [],
    };
  }
}

/**
 * Создает действие для инвалидации кэша в офлайн режиме
 * 
 * @param userId - ID пользователя
 * @param cacheKeys - Ключи кэша для инвалидации
 * @returns Действие для очереди синхронизации
 */
export function createCacheInvalidationAction(
  userId: string, 
  cacheKeys: string[]
) {
  return {
    type: "cache-invalidation" as const,
    data: { 
      userId, 
      cacheKeys
    },
    maxRetries: 1, // Кэш инвалидация не критична, поэтому только 1 попытка
  };
}

/**
 * Обрабатывает действие инвалидации кэша из очереди синхронизации
 * 
 * @param action - Действие из очереди
 */
export async function handleCacheInvalidationAction(action: { type: string; data: { userId: string; cacheKeys: string[] } }) {
  try {
    const { userId } = action.data;
    
    // Динамически импортируем функцию инвалидации
    const { invalidateUserProgressCache } = await import(
      "@shared/lib/actions/invalidateCoursesCache"
    );
    
    // Принудительно инвалидируем кэш (force = true)
    const result = await invalidateUserProgressCache(userId, true);
    
    console.warn(`[OfflineCache] Cache invalidation synced for user ${userId}:`, result);
    return result;
  } catch (error) {
    console.error("[OfflineCache] Failed to handle cache invalidation action:", error);
    throw error;
  }
}
