import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      // Упрощенное состояние - только navigator.onLine
      isOnline: typeof window !== "undefined" ? navigator.onLine : true,
      syncQueue: [],
      lastSyncTime: null,
      syncErrors: [],
      maxRetries: 3,
      lastSyncAttempt: null,
      syncCooldown: 60000, // 60 секунд между попытками синхронизации

      // Установка статуса онлайн/офлайн - только navigator.onLine
      setOnlineStatus: (isOnline: boolean) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`🌐 Setting online status: ${isOnline}`);
        }

        set({ isOnline });

        // Если стали онлайн, пытаемся синхронизировать очередь
        if (isOnline) {
          const state = get();
          if (state.syncQueue.length > 0) {
            const now = Date.now();
            if (!state.lastSyncAttempt || (now - state.lastSyncAttempt) >= state.syncCooldown) {
              setTimeout(() => {
                try {
                  get().syncOfflineActions();
                } catch (error) {
                  console.warn("Failed to sync offline actions:", error);
                }
              }, 1000);
            }
          }
        }
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
            
            if (!state.lastSyncAttempt || (now - state.lastSyncAttempt) >= state.syncCooldown) {
              setTimeout(() => {
                try {
                  get().syncOfflineActions();
                } catch (error) {
                  console.warn("Failed to sync offline actions:", error);
                }
              }, 100);
            }
          }
        } catch (error) {
          console.warn("Failed to add action to sync queue:", error);
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
          if (state.lastSyncAttempt && (now - state.lastSyncAttempt) < state.syncCooldown) {
            const remainingTime = Math.ceil((state.syncCooldown - (now - state.lastSyncAttempt)) / 1000);
            if (process.env.NODE_ENV !== "production") {
              console.warn(`⏰ Sync cooldown active, waiting ${remainingTime}s before next attempt`);
            }
            return;
          }

          // Обновляем время последней попытки синхронизации
          set({ lastSyncAttempt: now });

          const actionsToSync = [...state.syncQueue];

          for (const action of actionsToSync) {
            try {
              await syncAction(action);
              // Удаляем успешно синхронизированное действие
              get().removeFromSyncQueue(action.id);
              
              if (process.env.NODE_ENV !== "production") {
                console.warn(`✅ Successfully synced action: ${action.type}`);
              }
            } catch (error) {
              console.warn(`❌ Failed to sync action ${action.type}:`, error);
              
              // Увеличиваем счетчик попыток
              const updatedAction = { ...action, retryCount: action.retryCount + 1 };
              
              // Если превышено максимальное количество попыток, удаляем действие
              if (updatedAction.retryCount >= state.maxRetries) {
                get().removeFromSyncQueue(action.id);
                console.warn(`🗑️ Removed action ${action.type} after ${state.maxRetries} failed attempts`);
              }
            }
          }

          // Обновляем время последней синхронизации
          set({ lastSyncTime: now });
          
        } catch (error) {
          console.warn("Failed to sync offline actions:", error);
        }
      },
    }),
    {
      name: "offline-store",
      partialize: (state) => ({
        syncQueue: state.syncQueue,
        lastSyncTime: state.lastSyncTime,
        syncErrors: state.syncErrors,
        lastSyncAttempt: state.lastSyncAttempt,
      }),
    }
  )
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
  await fetch("/api/training/complete-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Синхронизация обновления профиля
async function syncProfileUpdate(data: ProfileUpdateData): Promise<void> {
  await fetch("/api/profile/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Синхронизация комментария
async function syncComment(data: CommentData): Promise<void> {
  await fetch("/api/comments/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Синхронизация рейтинга
async function syncRating(data: RatingData): Promise<void> {
  await fetch("/api/ratings/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Синхронизация статуса шага тренировки
async function syncStepStatusUpdate(data: StepStatusUpdateData): Promise<void> {
  try {
    // Импортируем функцию обновления статуса шага
    const { updateStepStatusServerAction } = await import(
      "@shared/lib/training/updateUserStepStatus"
    );

    // Вызываем серверное действие для обновления статуса
    await updateStepStatusServerAction(
      data.courseId,
      data.day,
      data.stepIndex,
      data.status as TrainingStatus,
      data.stepTitle
    );
  } catch (error) {
    console.warn("Failed to sync step status update:", error);
    throw error;
  }
}

// Синхронизация паузы шага
async function syncStepPause(data: StepPauseData): Promise<void> {
  try {
    // Импортируем функцию паузы уведомления
    const { pauseNotificationClient } = await import(
      "@shared/lib/StepNotification/manageStepNotificationSimple"
    );

    // Вызываем серверное действие для паузы
    await pauseNotificationClient({
      courseId: data.courseId,
      day: data.day,
      stepIndex: data.stepIndex,
    });
  } catch (error) {
    console.warn("Failed to sync step pause:", error);
    throw error;
  }
}

// Синхронизация возобновления шага
async function syncStepResume(data: StepResumeData): Promise<void> {
  try {
    // Импортируем функцию возобновления уведомления
    const { resumeNotificationClient } = await import(
      "@shared/lib/StepNotification/manageStepNotificationSimple"
    );

    // Вызываем серверное действие для возобновления
    await resumeNotificationClient({
      courseId: data.courseId,
      day: data.day,
      stepIndex: data.stepIndex,
      durationSec: data.timeLeft,
    });
  } catch (error) {
    console.warn("Failed to sync step resume:", error);
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
    
    console.warn(`[OfflineStore] Cache invalidation synced for user ${data.userId}`);
  } catch (error) {
    console.warn("Failed to sync cache invalidation:", error);
    throw error;
  }
}

// Синхронизация переключения избранного
async function syncFavoriteToggle(data: FavoriteToggleData): Promise<void> {
  try {
    // Импортируем функцию переключения избранного
    const { toggleFavoriteCourse } = await import(
      "@shared/lib/course/addtoFavorite"
    );

    // Вызываем серверное действие для переключения избранного
    await toggleFavoriteCourse(data.courseId);
    
    console.warn(`[OfflineStore] Favorite ${data.action} synced for course ${data.courseId}`);
  } catch (error) {
    console.warn("Failed to sync favorite toggle:", error);
    throw error;
  }
}

// Упрощенная функция инициализации store
export function initializeOfflineStore() {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV === "development") {
    console.warn("🔧 Initializing simplified offline store...");
  }

  // Добавляем слушатели событий сети - только navigator.onLine
  window.addEventListener("online", () => {
    if (process.env.NODE_ENV === "development") {
      console.warn("🌐 Browser went online");
    }
    useOfflineStore.getState().setOnlineStatus(true);
  });

  window.addEventListener("offline", () => {
    if (process.env.NODE_ENV === "development") {
      console.warn("🌐 Browser went offline");
    }
    useOfflineStore.getState().setOnlineStatus(false);
  });

  // Перехватываем fetch ошибки для обновления статуса
  try {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      try {
        // Добавляем таймаут для всех запросов
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 секунда таймаут
        
        const fetchPromise = originalFetch(args[0], {
          ...args[1],
          signal: controller.signal,
        });
        
        const result = await fetchPromise;
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        // Если произошла ошибка сети или таймаут — не понижаем статус вслепую
        if (error instanceof TypeError) {
          // Если браузер сам говорит, что офлайн — обновляем статус
          if (!navigator.onLine) {
            useOfflineStore.getState().setOnlineStatus(false);
          }
        }
        
        throw error;
      }
    };
  } catch (error) {
    console.warn("Error setting up fetch interceptor:", error);
  }

  // Инициализируем статус на основе navigator.onLine
  const isOnline = navigator.onLine;
  const initialState = useOfflineStore.getState();
  
  if (initialState.isOnline !== isOnline) {
    useOfflineStore.getState().setOnlineStatus(isOnline);
  }

  // Очищаем старые действия при инициализации
  useOfflineStore.getState().cleanupOldActions();
}