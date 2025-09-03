import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  CommentData,
  ConnectionQuality,
  OfflineAction,
  OfflineState,
  ProfileUpdateData,
  RatingData,
  StepCompletionData,
  StepStatusUpdateData,
  TrainingStatus,
} from "@gafus/types";

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      isOnline: typeof window !== "undefined" ? navigator.onLine : true,
      isStable: true,
      isActuallyConnected: typeof window !== "undefined" ? navigator.onLine : true,
      connectionQuality: 'good' as ConnectionQuality,
      networkMetrics: {
        latency: 0,
        quality: 'good' as ConnectionQuality,
        lastChecked: 0,
        consecutiveFailures: 0,
        adaptiveInterval: 300000, // 5 минут по умолчанию
      },
      syncQueue: [],
      lastSyncTime: null,
      syncErrors: [],
      maxRetries: 3,
      lastSyncAttempt: null, // Время последней попытки синхронизации
      syncCooldown: 60000, // 60 секунд между попытками синхронизации

      // Установка статуса онлайн/офлайн
      setOnlineStatus: (isOnline: boolean) => {
        const currentState = get();

        if (process.env.NODE_ENV !== "production") {
          console.warn(`🌐 Setting online status: ${isOnline} (was: ${currentState.isOnline})`);
        }

        // Просто устанавливаем статус без дополнительных проверок
        set({ isOnline, isActuallyConnected: isOnline });

        if (isOnline && typeof window !== "undefined") {
          // Если стали онлайн, пытаемся синхронизировать очередь
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
              }, 100);
            } else {
              if (process.env.NODE_ENV !== "production") {
                const remainingTime = Math.ceil((state.syncCooldown - (now - state.lastSyncAttempt)) / 1000);
                console.warn(`⏰ Skipping sync on connection change, cooldown active for ${remainingTime}s`);
              }
            }
          }
        }
      },

      // Установка стабильности сети
      setNetworkStability: (isStable: boolean) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`📶 Setting network stability: ${isStable}`);
        }
        set({ isStable });
      },

      // Установка реального состояния подключения
      setActualConnection: (isConnected: boolean) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`🔌 Setting actual connection: ${isConnected}`);
        }
        set({ isActuallyConnected: isConnected });
      },

      // Установка качества соединения
      setConnectionQuality: (quality: ConnectionQuality) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`📊 Setting connection quality: ${quality}`);
        }
        set((state) => ({
          connectionQuality: quality,
          networkMetrics: {
            ...state.networkMetrics,
            quality,
            lastChecked: Date.now(),
          },
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

          // Если онлайн, пытаемся синхронизировать с задержкой (но только если прошло достаточно времени)
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
            } else {
              if (process.env.NODE_ENV !== "production") {
                const remainingTime = Math.ceil((state.syncCooldown - (now - state.lastSyncAttempt)) / 1000);
                console.warn(`⏰ Skipping auto-sync, cooldown active for ${remainingTime}s`);
              }
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

      // Проверка качества соединения (временно отключена для предотвращения бесконечных запросов)
      checkConnectionQuality: async (): Promise<ConnectionQuality> => {
        try {
          // Быстрая проверка navigator.onLine
          if (!navigator.onLine) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("🔴 navigator.onLine = false, возвращаем offline");
            }
            return 'offline';
          }

          // Временно возвращаем базовое качество без запросов к API
          const quality: ConnectionQuality = 'good';
          
          // Обновляем метрики без реальной проверки
          set((state) => ({
            networkMetrics: {
              ...state.networkMetrics,
              latency: 0,
              quality,
              lastChecked: Date.now(),
              consecutiveFailures: 0,
            },
          }));

          if (process.env.NODE_ENV !== "production") {
            console.warn(`📊 Connection quality: ${quality} (cached, no API call)`);
          }

          return quality;
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("📊 Connection quality check failed:", error);
          }

          return 'offline';
        }
      },

      // Проверка реального соединения (полностью отключена для предотвращения бесконечных запросов)
      checkExternalConnection: async () => {
        console.warn("🔍 checkExternalConnection disabled to prevent infinite requests");
        // Просто возвращаем текущий статус без внешних запросов
        return get().isActuallyConnected;
      },

      // Синхронизация offline действий
      syncOfflineActions: async () => {
        try {
          const state = get();
          const now = Date.now();

          // Проверяем, что мы действительно онлайн и есть реальное соединение
          if (!state.isOnline || !state.isActuallyConnected || state.syncQueue.length === 0) {
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
            } catch (error) {
              // Увеличиваем счетчик попыток
              const updatedAction = { ...action, retryCount: action.retryCount + 1 };

              if (updatedAction.retryCount >= state.maxRetries) {
                // Превышено максимальное количество попыток, удаляем действие
                get().removeFromSyncQueue(action.id);
                const errorMessage = `Failed to sync ${action.type}: ${error instanceof Error ? error.message : String(error)}`;
                set((state) => ({
                  syncErrors: [...state.syncErrors, errorMessage],
                }));
              } else {
                // Обновляем действие с новым счетчиком попыток
                set((state) => ({
                  syncQueue: state.syncQueue.map((a) => (a.id === action.id ? updatedAction : a)),
                }));
              }
            }
          }
        } catch (error) {
          console.warn("Error in syncOfflineActions:", error);
        }
      },
    }),
    {
      name: "gafus-offline-store",
      partialize: (state) => ({
        syncQueue: state.syncQueue,
        lastSyncTime: state.lastSyncTime,
        syncErrors: state.syncErrors,
        maxRetries: state.maxRetries,
        lastSyncAttempt: state.lastSyncAttempt,
        syncCooldown: state.syncCooldown,
        networkMetrics: state.networkMetrics,
      }),
    },
  ),
);

// Функция для вычисления адаптивного интервала проверки
function getAdaptiveInterval(consecutiveFailures: number, connectionQuality: ConnectionQuality): number {
  // Базовые интервалы в миллисекундах
  const baseIntervals = {
    excellent: 300000,  // 5 минут
    good: 180000,       // 3 минуты
    fair: 120000,       // 2 минуты
    poor: 60000,        // 1 минута
    offline: 30000,     // 30 секунд
  };

  let baseInterval = baseIntervals[connectionQuality];
  
  // Увеличиваем интервал при множественных неудачах
  if (consecutiveFailures > 0) {
    const multiplier = Math.min(1 + (consecutiveFailures * 0.5), 3); // Максимум 3x
    baseInterval = Math.floor(baseInterval * multiplier);
  }
  
  // Минимальный интервал 10 секунд, максимальный 10 минут
  return Math.max(10000, Math.min(baseInterval, 600000));
}

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
      data.stepTitle,
      data.stepOrder,
    );

    if (process.env.NODE_ENV === "development") {
      console.warn("✅ Step status synced successfully:", data);
    }
  } catch (error) {
    console.error("❌ Failed to sync step status:", error);
    throw error;
  }
}

// Функция инициализации store
export function initializeOfflineStore() {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV === "development") {
    console.warn("🔧 Initializing offline store in development mode...");
    console.warn("🔧 This will provide detailed logging for network status detection");
    console.warn("🔧 Check browser console for detailed network status information");
  }

  // Добавляем слушатели событий сети
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

  // Упрощенная проверка стабильности сети
  const checkNetworkStability = () => {
    try {
      if (process.env.NODE_ENV === "development") {
        console.warn("📶 Checking network stability...");
      }

      // Используем Network Information API если доступен
      const connection = (navigator as { connection?: { effectiveType: string } }).connection;

      if (connection) {
        const networkType = connection.effectiveType;

        if (process.env.NODE_ENV === "development") {
          console.warn(`📶 Network Information API available: ${networkType}`);
        }

        if (networkType === "4g" || networkType === "3g") {
          useOfflineStore.getState().setNetworkStability(true);
        } else if (networkType === "2g" || networkType === "slow-2g") {
          useOfflineStore.getState().setNetworkStability(false);
        }
      } else {
        // Если нет Network Information API, считаем сеть стабильной если navigator.onLine = true
        const isOnline = navigator.onLine;
        useOfflineStore.getState().setNetworkStability(isOnline);
        
        if (process.env.NODE_ENV === "development") {
          console.warn(`📶 No Network Information API, using navigator.onLine: ${isOnline}`);
        }
      }
    } catch (error) {
      console.warn("Error checking network stability:", error);
    }
  };

  // Проверяем стабильность при изменении соединения
  try {
    if (
      (
        navigator as {
          connection?: { addEventListener: (event: string, handler: () => void) => void };
        }
      ).connection
    ) {
      (
        navigator as {
          connection?: { addEventListener: (event: string, handler: () => void) => void };
        }
      ).connection?.addEventListener("change", checkNetworkStability);
    }
  } catch (error) {
    console.warn("Error adding connection change listener:", error);
  }

  // Перехватываем fetch ошибки для обновления статуса (без бесконечных запросов)
  try {
    const originalFetch = window.fetch;
    let lastNetworkErrorTime = 0;
    
    window.fetch = async (...args) => {
      try {
        return await originalFetch(...args);
      } catch (error) {
        // Если произошла ошибка сети, обновляем статус (но не делаем новые запросы)
        if (
          error instanceof TypeError &&
          (error.message.includes("fetch") || error.message.includes("network"))
        ) {
          const now = Date.now();
          
          // Обновляем статус не чаще раза в 5 секунд
          if (now - lastNetworkErrorTime > 5000) {
            lastNetworkErrorTime = now;
            
            if (process.env.NODE_ENV === "development") {
              console.warn("🌐 Fetch error detected, updating offline status...");
            }
            
            // Просто обновляем статус без внешних запросов
            try {
              useOfflineStore.getState().setActualConnection(false);
            } catch {
              // Игнорируем ошибки
            }
          }
        }
        throw error;
      }
    };
  } catch (error) {
    console.warn("Error overriding fetch:", error);
  }

  // Адаптивная периодическая проверка реального соединения (временно отключена)
  if (process.env.NODE_ENV === "development") {
    console.warn("🔄 Adaptive periodic connection check disabled to prevent infinite requests");
  }

  // Инициализируем статус сети при загрузке
  try {
    const initialState = useOfflineStore.getState();
    const isOnline = navigator.onLine;
    
    if (process.env.NODE_ENV === "development") {
      console.warn(`🔧 Initializing network status: online=${isOnline}, actuallyConnected=${initialState.isActuallyConnected}`);
    }
    
    // Устанавливаем корректный статус сети
    if (initialState.isOnline !== isOnline || initialState.isActuallyConnected !== isOnline) {
      useOfflineStore.getState().setOnlineStatus(isOnline);
    }
    
    // Проверяем стабильность сети
    checkNetworkStability();
  } catch (error) {
    console.warn("Error initializing network status:", error);
  }
}
