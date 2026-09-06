import { reportClientError } from "@gafus/error-handling";
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

type OwnedOfflineAction = OfflineAction & { ownerId?: string };

const SYNC_LOCK_KEY = "gafus-offline-sync-lock";
const SYNC_LOCK_TTL_MS = 30_000;
let currentOwnerId: string | null = null;
let syncInThisTab = false;

/** The session owner is supplied by UserProvider and is never persisted separately. */
export function setOfflineSyncOwner(userId: string | null): void {
  currentOwnerId = userId;
}

function isOwnedByCurrentSession(action: OfflineAction): action is OwnedOfflineAction & { ownerId: string } {
  return (
    typeof (action as OwnedOfflineAction).ownerId === "string" &&
    (action as OwnedOfflineAction).ownerId === currentOwnerId
  );
}

function actionBelongsToOwner(action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">): boolean {
  const data = action.data as { userId?: unknown };
  return typeof data.userId !== "string" || data.userId === currentOwnerId;
}

async function withSyncLock(run: () => Promise<void>): Promise<void> {
  if (syncInThisTab || typeof window === "undefined") return;
  syncInThisTab = true;
  const token = crypto.randomUUID();

  try {
    // navigator.locks is atomic across tabs when available. The localStorage lease
    // also protects browsers without that API and makes the ownership observable.
    const executeWithLease = async () => {
      const now = Date.now();
      const existing = window.localStorage.getItem(SYNC_LOCK_KEY);
      if (existing) {
        try {
          const parsed = JSON.parse(existing) as { token?: string; expiresAt?: number };
          if (typeof parsed.expiresAt === "number" && parsed.expiresAt > now) return;
        } catch {
          // A malformed stale value is safe to replace with our short lease.
        }
      }
      const lease = JSON.stringify({ token, expiresAt: now + SYNC_LOCK_TTL_MS });
      window.localStorage.setItem(SYNC_LOCK_KEY, lease);
      if (window.localStorage.getItem(SYNC_LOCK_KEY) !== lease) return;

      try {
        await run();
      } finally {
        const held = window.localStorage.getItem(SYNC_LOCK_KEY);
        if (held) {
          try {
            if ((JSON.parse(held) as { token?: string }).token === token) window.localStorage.removeItem(SYNC_LOCK_KEY);
          } catch {
            // Do not remove a lock we cannot prove belongs to this tab.
          }
        }
      }
    };

    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) {
      await locks.request(SYNC_LOCK_KEY, { ifAvailable: true }, async (lock) => {
        if (lock) await executeWithLease();
      });
    } else {
      await executeWithLease();
    }
  } catch (error) {
    logger.warn("Could not acquire offline sync lock", {
      operation: "offline_sync_lock_error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    syncInThisTab = false;
  }
}

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
                  const err = error instanceof Error ? error : new Error(String(error));
                  reportClientError(err, { issueKey: "OfflineStore", keys: { operation: "sync" } });
                  logger.warn("Failed to sync offline actions (online)", {
                    operation: "sync_offline_actions_online_error",
                    error: err.message,
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
              const err = error instanceof Error ? error : new Error(String(error));
              reportClientError(err, { issueKey: "OfflineStore", keys: { operation: "syncVideo" } });
              logger.warn("Failed to sync video progress", {
                operation: "sync_video_progress_error",
                error: err.message,
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
          if (!currentOwnerId) {
            logger.warn("Skipping offline action without an authenticated session owner", {
              operation: "skip_unowned_offline_action",
              actionType: action.type,
            });
            return;
          }
          if (!actionBelongsToOwner(action)) {
            logger.warn("Skipping offline action with a different user owner", {
              operation: "skip_foreign_offline_action",
              actionType: action.type,
            });
            return;
          }

          const newAction: OwnedOfflineAction = {
            ...action,
            id: crypto.randomUUID(),
            ownerId: currentOwnerId,
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
                  const err = error instanceof Error ? error : new Error(String(error));
                  reportClientError(err, { issueKey: "OfflineStore", keys: { operation: "sync" } });
                  logger.warn("Failed to sync offline actions (retry)", {
                    operation: "sync_offline_actions_retry_error",
                    error: err.message,
                  });
                }
              }, 100);
            }
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          reportClientError(err, { issueKey: "OfflineStore", keys: { operation: "addToQueue" } });
          logger.warn("Failed to add action to sync queue", {
            operation: "add_action_to_sync_queue_error",
            actionType: action.type,
            error: err.message,
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

      // Сохранённые действия не удаляются по возрасту: без подтверждения сервера
      // они остаются для владельца следующей сессии.
      cleanupOldActions: () => {
        return;
      },

      // Синхронизация offline действий
      syncOfflineActions: async () => {
        try {
          const initialState = get();
          if (!initialState.isOnline || initialState.syncQueue.length === 0 || !currentOwnerId) {
            return;
          }
          await withSyncLock(async () => {
            const state = get();
            const now = Date.now();
            if (
              !state.isOnline ||
              (state.lastSyncAttempt && now - state.lastSyncAttempt < state.syncCooldown)
            ) {
              return;
            }
            set({ lastSyncAttempt: now });

            const actionsToSync = state.syncQueue.filter(isOwnedByCurrentSession);
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
                const syncError = error instanceof Error ? error : new Error(String(error));
                reportClientError(syncError, {
                  issueKey: "OfflineStore",
                  keys: { operation: "syncAction", actionType: action.type },
                });
                logger.error(
                  `Failed to sync action ${action.type} after ${state.maxRetries} attempts`,
                  syncError,
                  {
                    operation: "sync_action_failed_final",
                    actionType: action.type,
                    actionId: action.id,
                  },
                );
                // Keep an unconfirmed action. A later session for the same owner can retry it.
              }
            }
            set({ lastSyncTime: now });
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          reportClientError(err, { issueKey: "OfflineStore", keys: { operation: "sync" } });
          logger.warn("Failed to sync offline actions (main)", {
            operation: "sync_offline_actions_main_error",
            error: err.message,
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
    const errorText = await response.text().catch(() => "Не удалось прочитать ответ сервера");
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
    const errorText = await response.text().catch(() => "Не удалось прочитать ответ сервера");
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
    const errorText = await response.text().catch(() => "Не удалось прочитать ответ сервера");
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
    const errorText = await response.text().catch(() => "Не удалось прочитать ответ сервера");
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
    const result = await updateStepStatusServerAction(
      data.courseId,
      dayOnCourseId,
      data.stepIndex,
      data.status as TrainingStatus,
      data.stepTitle,
    );
    assertBusinessSuccess(result, "step status update");
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
    const results = await Promise.allSettled([
      pauseUserStepServerAction(data.courseId, dayOnCourseId, data.stepIndex, data.timeLeft),
      pauseNotificationClient({
        courseId: data.courseId,
        dayOnCourseId,
        stepIndex: data.stepIndex,
      }),
    ]);
    if (results[0].status !== "fulfilled") throw results[0].reason;
    assertBusinessSuccess(results[0].value, "step pause");
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
    const results = await Promise.allSettled([
      resumeUserStepServerAction(data.courseId, dayOnCourseId, data.stepIndex),
      resumeNotificationClient({
        courseId: data.courseId,
        dayOnCourseId,
        stepIndex: data.stepIndex,
        durationSec: data.timeLeft,
      }),
    ]);
    if (results[0].status !== "fulfilled") throw results[0].reason;
    assertBusinessSuccess(results[0].value, "step resume");
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
    const result = await toggleFavoriteCourseAction(data.courseId);
    if (typeof result !== "boolean") {
      throw new Error("Favorite toggle was not confirmed by the server");
    }
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

function assertBusinessSuccess(result: unknown, operation: string): void {
  if (!result || typeof result !== "object" || (result as { success?: unknown }).success !== true) {
    throw new Error(`${operation} was not confirmed by the server`);
  }
}

// Инициализирует только browser network events. Navigation and fetch interception
// deliberately live outside this recovery path.
export function initializeOfflineStore(): (() => void) | undefined {
  if (typeof window === "undefined") return undefined;

  // Инициализируем статус на основе navigator.onLine
  const isOnline = navigator.onLine;
  const initialState = useOfflineStore.getState();

  if (initialState.isOnline !== isOnline) {
    useOfflineStore.getState().setOnlineStatus(isOnline);
  }

  const handleOnline = () => {
    const store = useOfflineStore.getState();
    store.setOnlineStatus(true);
    void store.syncOfflineActions();
  };
  const handleOffline = () => {
    useOfflineStore.getState().setOnlineStatus(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
