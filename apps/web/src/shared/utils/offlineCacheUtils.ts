"use client";

import { useOfflineStore } from "@shared/stores/offlineStore";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для offline cache utils
const logger = createWebLogger("web-offline-cache-utils");

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
  force: boolean = false,
): Promise<{ success: boolean; skipped?: boolean; reason?: string; error?: string }> {
  try {
    // Если не принудительная инвалидация и мы офлайн
    if (!force && isOffline()) {
      logger.warn("[OfflineCache] Skipping cache invalidation - offline mode", {
        operation: "skip_cache_invalidation_offline",
      });
      return {
        success: true,
        skipped: true,
        reason: "offline",
      };
    }

    // Выполняем инвалидацию
    const result = await invalidateFunction();
    return { ...result };
  } catch (error) {
    logger.error("[OfflineCache] Error during cache invalidation", error as Error, {
      operation: "cache_invalidation_error",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Добавляет действие в очередь синхронизации для выполнения при восстановлении соединения
 *
 * @param action - Действие для синхронизации
 */
export function addToSyncQueue(action: {
  type: "cache-invalidation";
  data: { userId: string; cacheKeys: string[] };
  maxRetries: number;
}) {
  try {
    const offlineStore = useOfflineStore.getState();
    offlineStore.addToSyncQueue(action);
    logger.info("[OfflineCache] Action added to sync queue", {
      operation: "add_to_sync_queue",
      actionType: action.type,
    });
  } catch (error) {
    logger.error("[OfflineCache] Failed to add action to sync queue", error as Error, {
      operation: "add_to_sync_queue_failed",
      actionType: action.type,
    });
  }
}

/**
 * Выполняет синхронизацию очереди при восстановлении соединения
 */
export async function syncOfflineQueue() {
  try {
    const offlineStore = useOfflineStore.getState();
    if (offlineStore.syncQueue.length > 0) {
      logger.info("[OfflineCache] Starting offline queue sync", {
        operation: "start_offline_queue_sync",
        queueLength: offlineStore.syncQueue.length,
      });
      await offlineStore.syncOfflineActions();
    }
  } catch (error) {
    logger.error("[OfflineCache] Failed to sync offline queue", error as Error, {
      operation: "sync_offline_queue_failed",
    });
  }
}

/**
 * Очищает очередь синхронизации
 */
export function clearSyncQueue() {
  try {
    const offlineStore = useOfflineStore.getState();
    offlineStore.clearSyncQueue();
    logger.info("[OfflineCache] Sync queue cleared", {
      operation: "clear_sync_queue",
    });
  } catch (error) {
    logger.error("[OfflineCache] Failed to clear sync queue", error as Error, {
      operation: "clear_sync_queue_failed",
    });
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
    logger.error("[OfflineCache] Failed to get sync queue status", error as Error, {
      operation: "get_sync_queue_status_failed",
    });
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
export function createCacheInvalidationAction(userId: string, cacheKeys: string[]) {
  return {
    type: "cache-invalidation" as const,
    data: {
      userId,
      cacheKeys,
    },
    maxRetries: 1, // Кэш инвалидация не критична, поэтому только 1 попытка
  };
}

/**
 * Обрабатывает действие инвалидации кэша из очереди синхронизации
 *
 * @param action - Действие из очереди
 */
export async function handleCacheInvalidationAction(action: {
  type: string;
  data: { userId: string; cacheKeys: string[] };
}) {
  let userId: string | null = null; // Moved declaration outside try block
  try {
    userId = action.data.userId;

    // Динамически импортируем функцию инвалидации
    const { invalidateUserProgressCache } = await import(
      "@shared/lib/actions/invalidateCoursesCache"
    );

    // Принудительно инвалидируем кэш (force = true)
    const result = await invalidateUserProgressCache(userId, true);

    logger.info(`[OfflineCache] Cache invalidation synced for user ${userId}`, {
      operation: "cache_invalidation_synced",
      userId: userId,
      result: result,
    });
    return result;
  } catch (error) {
    logger.error("[OfflineCache] Failed to handle cache invalidation action", error as Error, {
      operation: "handle_cache_invalidation_action_failed",
      userId: userId,
    });
    throw error;
  }
}
