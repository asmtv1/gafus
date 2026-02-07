import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";
import { retryWithBackoff } from "@gafus/core/utils/retry";

import type {
  CommentData,
  OfflineAction,
  OfflineState,
  ProfileUpdateData,
  RatingData,
  StepCompletionData,
  StepStatusUpdateData,
  StepPauseData,
  StepResumeData,
  TrainingStatus,
  FavoriteToggleData,
} from "@gafus/types";

// Создаем логгер для offline store
const logger = createWebLogger("web-offline-store");

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      // Упрощенное состояние - только navigator.onLine
      isOnline: true, // По умолчанию онлайн, обновится на клиенте
      activeDownloads: 0,
      syncQueue: [],
      lastSyncTime: null,
      syncErrors: [],
      maxRetries: 3,
      lastSyncAttempt: null,
      syncCooldown: 60000, // 60 секунд между попытками синхронизации

      // Установка статуса онлайн/офлайн
      setOnlineStatus: (isOnline: boolean) => {
        const currentState = get();

        // Если статус не изменился, ничего не делаем
        if (currentState.isOnline === isOnline) {
          return;
        }

        logger.info("Online status changed", {
          operation: "online_status_change",
          isOnline,
          navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        });

        set({ isOnline });

        // Если стали онлайн, пытаемся синхронизировать очередь
        if (isOnline) {
          const state = get();
          if (state.syncQueue.length > 0) {
            const now = Date.now();
            if (!state.lastSyncAttempt || now - state.lastSyncAttempt >= state.syncCooldown) {
              setTimeout(() => {
                try {
                  get().syncOfflineActions();
                } catch (error) {
                  logger.warn("Failed to sync offline actions (online)", {
                    operation: "sync_offline_actions_online_error",
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              }, 1000);
            }
          }

          // ДОБАВЛЕНО: Синхронизация video progress из IndexedDB
          setTimeout(async () => {
            try {
              const { syncVideoProgressFromIndexedDB } = await import(
                "@shared/lib/video/videoProgressStorage"
              );
              await syncVideoProgressFromIndexedDB();
            } catch (error) {
              logger.warn("Failed to sync video progress", {
                operation: "sync_video_progress_error",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }, 1500); // Через 1.5 сек после основной синхронизации
        }
      },

      startDownload: () => {
        set((state) => ({ activeDownloads: state.activeDownloads + 1 }));
      },

      finishDownload: () => {
        set((state) => ({
          activeDownloads: Math.max(0, state.activeDownloads - 1),
        }));
      },

      // Добавление действия в очередь синхронизации
      addToSyncQueue: (action) => {
        try {
          const newAction: OfflineAction = {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            retryCount: 0,
          };

          set((state) => ({
            syncQueue: [...state.syncQueue, newAction],
          }));

          // Если онлайн, пытаемся синхронизировать с задержкой
          if (get().isOnline) {
            const now = Date.now();
            const state = get();

            if (!state.lastSyncAttempt || now - state.lastSyncAttempt >= state.syncCooldown) {
              setTimeout(() => {
                try {
                  get().syncOfflineActions();
                } catch (error) {
                  logger.warn("Failed to sync offline actions (retry)", {
                    operation: "sync_offline_actions_retry_error",
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              }, 100);
            }
          }
        } catch (error) {
          logger.warn("Failed to add action to sync queue", {
            operation: "add_action_to_sync_queue_error",
            actionType: action.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },

      // Удаление действия из очереди
      removeFromSyncQueue: (id: string) => {
        set((state) => ({
          syncQueue: state.syncQueue.filter((action: { id: string }) => action.id !== id),
        }));
      },

      // Очистка очереди синхронизации
      clearSyncQueue: () => {
        set({ syncQueue: [] });
      },

      // Очистка старых действий из очереди
      cleanupOldActions: () => {
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней
        const now = Date.now();

        set((state) => ({
          syncQueue: state.syncQueue.filter((action) => {
            const age = now - action.timestamp;
            return age < maxAge;
          }),
        }));
      },

      // Синхронизация offline действий
      syncOfflineActions: async () => {
        try {
          const state = get();
          const now = Date.now();

          // Сначала очищаем старые действия
          get().cleanupOldActions();

          // Проверяем, что мы онлайн и есть действия для синхронизации
          if (!state.isOnline || state.syncQueue.length === 0) {
            return;
          }

          // Проверяем таймаут между попытками синхронизации
          if (state.lastSyncAttempt && now - state.lastSyncAttempt < state.syncCooldown) {
            return;
          }

          // Обновляем время последней попытки синхронизации
          set({ lastSyncAttempt: now });

          const actionsToSync = [...state.syncQueue];

          for (const action of actionsToSync) {
            try {
              // Используем retryWithBackoff для экспоненциальной задержки
              await retryWithBackoff(() => syncAction(action), {
                maxRetries: state.maxRetries,
                baseDelay: 1000, // 1 секунда
                maxDelay: 10000, // 10 секунд максимум
                onRetry: (attempt, error) => {
                  logger.warn(`Retry ${attempt}/${state.maxRetries} for action ${action.type}`, {
                    operation: "sync_action_retry",
                    actionType: action.type,
                    attempt,
                    error: error.message,
                  });
                },
              });
              // Удаляем успешно синхронизированное действие
              get().removeFromSyncQueue(action.id);
            } catch (error) {
              // Если все попытки исчерпаны, удаляем действие
              const syncError = error instanceof Error ? error : new Error(String(error));
              logger.error(
                `Failed to sync action ${action.type} after ${state.maxRetries} attempts`,
                syncError,
                {
                  operation: "sync_action_failed_final",
                  actionType: action.type,
                  actionId: action.id,
                },
              );
              get().removeFromSyncQueue(action.id);
            }
          }

          // Обновляем время последней синхронизации
          set({ lastSyncTime: now });
        } catch (error) {
          logger.warn("Failed to sync offline actions (main)", {
            operation: "sync_offline_actions_main_error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
    {
      name: "offline-store",
      partialize: (state) => ({
        syncQueue: state.syncQueue,
        lastSyncTime: state.lastSyncTime,
        syncErrors: state.syncErrors,
      }),
    },
  ),
);

// Функция синхронизации конкретного действия
async function syncAction(action: OfflineAction): Promise<void> {
  switch (action.type) {
    case "step-completion":
      await syncStepCompletion(action.data as StepCompletionData);
      break;
    case "profile-update":
      await syncProfileUpdate(action.data as ProfileUpdateData);
      break;
    case "comment":
      await syncComment(action.data as CommentData);
      break;
    case "rating":
      await syncRating(action.data as RatingData);
      break;
    case "step-status-update":
      await syncStepStatusUpdate(action.data as StepStatusUpdateData);
      break;
    case "step-pause":
      await syncStepPause(action.data as StepPauseData);
      break;
    case "step-resume":
      await syncStepResume(action.data as StepResumeData);
      break;
    case "cache-invalidation":
      await syncCacheInvalidation(action.data as { userId: string; cacheKeys: string[] });
      break;
    case "favorite-toggle":
      await syncFavoriteToggle(action.data as FavoriteToggleData);
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// Синхронизация завершения шага
async function syncStepCompletion(data: StepCompletionData): Promise<void> {
  const response = await fetch("/api/training/complete-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.warn("Failed to sync step completion", {
      operation: "sync_step_completion_error",
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `Failed to sync step completion: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }
}

// Синхронизация обновления профиля
async function syncProfileUpdate(data: ProfileUpdateData): Promise<void> {
  const response = await fetch("/api/profile/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.warn("Failed to sync profile update", {
      operation: "sync_profile_update_error",
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `Failed to sync profile update: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }
}

// Синхронизация комментария
async function syncComment(data: CommentData): Promise<void> {
  const response = await fetch("/api/comments/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.warn("Failed to sync comment", {
      operation: "sync_comment_error",
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `Failed to sync comment: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }
}

// Синхронизация рейтинга
async function syncRating(data: RatingData): Promise<void> {
  const response = await fetch("/api/ratings/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.warn("Failed to sync rating", {
      operation: "sync_rating_error",
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `Failed to sync rating: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }
}

// Синхронизация статуса шага тренировки
async function syncStepStatusUpdate(data: StepStatusUpdateData): Promise<void> {
  try {
    // Импортируем функцию обновления статуса шага
    const { updateStepStatusServerAction } = await import(
      "@shared/lib/training/updateUserStepStatus"
    );

    // Вызываем серверное действие для обновления статуса
    const dayOnCourseId = (data as { dayOnCourseId: string }).dayOnCourseId;
    if (!dayOnCourseId) {
      throw new Error("dayOnCourseId is required");
    }
    await updateStepStatusServerAction(
      data.courseId,
      dayOnCourseId,
      data.stepIndex,
      data.status as TrainingStatus,
      data.stepTitle,
    );
  } catch (error) {
    logger.warn("Failed to sync step status update", {
      operation: "sync_step_status_update_error",
      courseId: data.courseId,
      dayOnCourseId: (data as { dayOnCourseId?: string }).dayOnCourseId,
      stepIndex: data.stepIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Синхронизация паузы шага: серверная пауза + StepNotification
async function syncStepPause(data: StepPauseData): Promise<void> {
  try {
    const [{ pauseUserStepServerAction }, { pauseNotificationClient }] = await Promise.all([
      import("@shared/lib/training/pauseResumeUserStep"),
      import("@shared/lib/StepNotification/manageStepNotificationSimple"),
    ]);
    const dayOnCourseId = (data as { dayOnCourseId: string }).dayOnCourseId;
    if (!dayOnCourseId) {
      throw new Error("dayOnCourseId is required");
    }
    await Promise.allSettled([
      pauseUserStepServerAction(data.courseId, dayOnCourseId, data.stepIndex, data.timeLeft),
      pauseNotificationClient({
        courseId: data.courseId,
        dayOnCourseId,
        stepIndex: data.stepIndex,
      }),
    ]);
  } catch (error) {
    logger.warn("Failed to sync step pause", {
      operation: "sync_step_pause_error",
      courseId: data.courseId,
      dayOnCourseId: (data as { dayOnCourseId?: string }).dayOnCourseId,
      stepIndex: data.stepIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Синхронизация возобновления шага: снимаем серверную паузу + возобновляем StepNotification
async function syncStepResume(data: StepResumeData): Promise<void> {
  try {
    const [{ resumeUserStepServerAction }, { resumeNotificationClient }] = await Promise.all([
      import("@shared/lib/training/pauseResumeUserStep"),
      import("@shared/lib/StepNotification/manageStepNotificationSimple"),
    ]);
    const dayOnCourseId = (data as { dayOnCourseId: string }).dayOnCourseId;
    if (!dayOnCourseId) {
      throw new Error("dayOnCourseId is required");
    }
    await Promise.allSettled([
      resumeUserStepServerAction(data.courseId, dayOnCourseId, data.stepIndex),
      resumeNotificationClient({
        courseId: data.courseId,
        dayOnCourseId,
        stepIndex: data.stepIndex,
        durationSec: data.timeLeft,
      }),
    ]);
  } catch (error) {
    logger.warn("Failed to sync step resume", {
      operation: "sync_step_resume_error",
      courseId: data.courseId,
      dayOnCourseId: (data as { dayOnCourseId?: string }).dayOnCourseId,
      stepIndex: data.stepIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Синхронизация инвалидации кэша
async function syncCacheInvalidation(data: { userId: string; cacheKeys: string[] }): Promise<void> {
  try {
    // Импортируем функцию инвалидации кэша
    const { invalidateUserProgressCache } = await import(
      "@shared/lib/actions/invalidateCoursesCache"
    );

    // Принудительно инвалидируем кэш (force = true)
    await invalidateUserProgressCache(data.userId, true);

    logger.info(`[OfflineStore] Cache invalidation synced for user ${data.userId}`, {
      operation: "cache_invalidation_synced",
      userId: data.userId,
    });
  } catch (error) {
    logger.warn("Failed to sync cache invalidation", {
      operation: "sync_cache_invalidation_error",
      userId: data.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Синхронизация переключения избранного
async function syncFavoriteToggle(data: FavoriteToggleData): Promise<void> {
  try {
    // Импортируем функцию переключения избранного
    const { toggleFavoriteCourseAction } = await import("@shared/server-actions");

    // Вызываем серверное действие для переключения избранного
    await toggleFavoriteCourseAction(data.courseId);
  } catch (error) {
    logger.warn("Failed to sync favorite toggle", {
      operation: "sync_favorite_toggle_error",
      courseId: data.courseId,
      action: data.action,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Упрощенная функция инициализации store
// Слушатели событий браузера и редирект обрабатываются в offlineDetector
export function initializeOfflineStore() {
  if (typeof window === "undefined") return;

  // Инициализируем статус на основе navigator.onLine
  const isOnline = navigator.onLine;
  const initialState = useOfflineStore.getState();

  if (initialState.isOnline !== isOnline) {
    useOfflineStore.getState().setOnlineStatus(isOnline);
  }

  // Очищаем старые действия при инициализации
  useOfflineStore.getState().cleanupOldActions();
}
