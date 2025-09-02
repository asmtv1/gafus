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

        set({ isOnline, isActuallyConnected: isOnline });

        if (isOnline && typeof window !== "undefined") {
          // Если стали онлайн и мы в браузере, проверяем реальное соединение в фоне
          const checkDelay = process.env.NODE_ENV !== "production" ? 500 : 100;

          if (process.env.NODE_ENV !== "production") {
            console.warn(`⏰ Will check external connection in ${checkDelay}ms`);
          }

          // Используем замыкание для получения актуального состояния
          setTimeout(() => {
            try {
              // Получаем актуальное состояние на момент выполнения
              const actualState = get();
              
              actualState
                .checkExternalConnection()
                .then((isConnected) => {
                  if (process.env.NODE_ENV !== "production") {
                    console.warn(`🔍 External connection check result: ${isConnected}`);
                  }
                  
                  // Получаем еще раз актуальное состояние для обновления
                  const stateForUpdate = get();
                  
                  // Обновляем реальное соединение только если проверка показала, что его нет
                  if (!isConnected) {
                    set({ isActuallyConnected: false });
                  }
                  
                  if (isConnected && stateForUpdate.syncQueue.length > 0) {
                    // Если есть реальное соединение и есть действия в очереди, синхронизируем
                    // Но только если прошло достаточно времени с последней попытки
                    const now = Date.now();
                    if (!stateForUpdate.lastSyncAttempt || (now - stateForUpdate.lastSyncAttempt) >= stateForUpdate.syncCooldown) {
                      stateForUpdate.syncOfflineActions();
                    } else {
                      if (process.env.NODE_ENV !== "production") {
                        const remainingTime = Math.ceil((stateForUpdate.syncCooldown - (now - stateForUpdate.lastSyncAttempt)) / 1000);
                        console.warn(`⏰ Skipping sync on connection change, cooldown active for ${remainingTime}s`);
                      }
                    }
                  }
                })
                .catch((error) => {
                  console.warn("Failed to check actual connection:", error);
                });
            } catch (error) {
              console.warn("Error in setOnlineStatus:", error);
            }
          }, checkDelay);
        } else {
          // Если стали офлайн, сбрасываем флаг реального соединения
          if (process.env.NODE_ENV !== "production") {
            console.warn("🔴 Resetting actual connection flag");
          }
          set({ isActuallyConnected: false });
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

      // Проверка качества соединения
      checkConnectionQuality: async (): Promise<ConnectionQuality> => {
        try {
          // Быстрая проверка navigator.onLine
          if (!navigator.onLine) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("🔴 navigator.onLine = false, возвращаем offline");
            }
            return 'offline';
          }

          if (process.env.NODE_ENV !== "production") {
            console.warn("📊 Checking connection quality...");
          }

          const startTime = Date.now();
          
          // Используем собственный API для проверки
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

          try {
            const response = await fetch("/api/ping", {
              method: "GET",
              cache: "no-cache",
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;

            if (response.ok) {
              let quality: ConnectionQuality;
              if (latency < 100) {
                quality = 'excellent';
              } else if (latency < 300) {
                quality = 'good';
              } else if (latency < 1000) {
                quality = 'fair';
              } else {
                quality = 'poor';
              }

              // Обновляем метрики
              set((state) => ({
                networkMetrics: {
                  ...state.networkMetrics,
                  latency,
                  quality,
                  lastChecked: Date.now(),
                  consecutiveFailures: 0,
                },
              }));

              if (process.env.NODE_ENV !== "production") {
                console.warn(`📊 Connection quality: ${quality} (${latency}ms)`);
              }

              return quality;
            } else {
              throw new Error(`HTTP ${response.status}`);
            }
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        } catch (error) {
          // Увеличиваем счетчик неудач
          set((state) => ({
            networkMetrics: {
              ...state.networkMetrics,
              consecutiveFailures: state.networkMetrics.consecutiveFailures + 1,
              lastChecked: Date.now(),
            },
          }));

          if (process.env.NODE_ENV !== "production") {
            console.warn("📊 Connection quality check failed:", error);
          }

          return 'offline';
        }
      },

      // Проверка реального соединения через внешние сервисы
      checkExternalConnection: async () => {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.warn("🔍 Checking external connection...");
          }

          // Улучшенная fallback стратегия с приоритетами
          const fallbackUrls = [
            { url: "/api/ping", timeout: 3000, priority: 1 }, // Собственный API - приоритет 1
            { url: "https://www.google.com/favicon.ico", timeout: 5000, priority: 2 },
            { url: "https://httpbin.org/status/200", timeout: 5000, priority: 3 },
            { url: "https://api.github.com/zen", timeout: 5000, priority: 4 },
          ];

          // Сортируем по приоритету
          fallbackUrls.sort((a, b) => a.priority - b.priority);

          for (const { url, timeout } of fallbackUrls) {
            try {
              if (process.env.NODE_ENV !== "production") {
                console.warn(`🔍 Trying ${url} (timeout: ${timeout}ms)...`);
              }

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), timeout);

              const response = await fetch(url, {
                method: "HEAD",
                cache: "no-cache",
                signal: controller.signal,
                mode: url.startsWith('http') ? "no-cors" : "cors",
              });

              clearTimeout(timeoutId);

              if (response.ok || response.type === 'opaque') { // opaque для no-cors
                if (process.env.NODE_ENV !== "production") {
                  console.warn(`✅ Connection confirmed via: ${url}`);
                }
                
                // Обновляем метрики при успешном соединении
                set((state) => ({
                  isActuallyConnected: true,
                  networkMetrics: {
                    ...state.networkMetrics,
                    consecutiveFailures: 0,
                    lastChecked: Date.now(),
                  },
                }));
                
                return true;
              }
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") {
                if (process.env.NODE_ENV !== "production") {
                  console.warn(`⏰ Timeout for ${url}`);
                }
              } else {
                if (process.env.NODE_ENV !== "production") {
                  console.warn(`⚠️ Failed to check ${url}:`, error);
                }
              }
              // Продолжаем с следующим URL
            }
          }

          // В dev режиме полагаемся на navigator.onLine для избежания CORS проблем
          if (process.env.NODE_ENV !== "production") {
            console.warn("🔍 Dev mode: using navigator.onLine for connection status");
            const navigatorOnline = typeof window !== "undefined" ? navigator.onLine : true;
            set({ isActuallyConnected: navigatorOnline });
            return navigatorOnline;
          }

          // Если все запросы не работают, полагаемся на navigator.onLine
          const navigatorOnline = typeof window !== "undefined" ? navigator.onLine : true;
          
          if (process.env.NODE_ENV !== "production") {
            console.warn(`🔄 All checks failed, using fallback status: ${navigatorOnline} (navigator.onLine)`);
          }

          set({ isActuallyConnected: navigatorOnline });
          return navigatorOnline;
        } catch (error) {
          console.warn("External network check failed:", error);
          set({ isActuallyConnected: false });
          return false;
        }
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

  // Проверяем стабильность сети с приоритетом нативных API
  const checkNetworkStability = () => {
    try {
      if (process.env.NODE_ENV === "development") {
        console.warn("📶 Checking network stability...");
      }

      // Приоритет 1: Network Information API (самый точный)
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

        // Если есть Network Information API, не используем внешние пинги
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.warn("📶 Network Information API not available, using external checks");
      }

      // Приоритет 2: Проверяем реальное соединение только при необходимости
      // (например, при изменении статуса сети)
      if (!useOfflineStore.getState().isActuallyConnected) {
        useOfflineStore
          .getState()
          .checkExternalConnection()
          .then((isConnected) => {
            useOfflineStore.getState().setNetworkStability(isConnected);
          })
          .catch(() => {
            // Игнорируем ошибки проверки соединения
          });
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

  // Перехватываем fetch ошибки для проверки реального соединения
  try {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        return await originalFetch(...args);
      } catch (error) {
        // Если произошла ошибка сети, проверяем реальное соединение
        if (
          error instanceof TypeError &&
          (error.message.includes("fetch") || error.message.includes("network"))
        ) {
          if (process.env.NODE_ENV === "development") {
            console.warn("🌐 Fetch error detected, checking external connection...");
          }
          try {
            useOfflineStore.getState().checkExternalConnection();
          } catch {
            // Игнорируем ошибки проверки соединения
          }
        }
        throw error;
      }
    };
  } catch (error) {
    console.warn("Error overriding fetch:", error);
  }

  // Адаптивная периодическая проверка реального соединения
  try {
    let intervalId: NodeJS.Timeout | null = null;
    
    const scheduleNextCheck = () => {
      if (intervalId) {
        clearTimeout(intervalId);
      }
      
      const state = useOfflineStore.getState();
      const adaptiveInterval = getAdaptiveInterval(
        state.networkMetrics.consecutiveFailures,
        state.networkMetrics.quality
      );
      
      if (process.env.NODE_ENV === "development") {
        console.warn(`🔄 Scheduling next check in ${Math.round(adaptiveInterval / 1000)}s (failures: ${state.networkMetrics.consecutiveFailures}, quality: ${state.networkMetrics.quality})`);
      }
      
      intervalId = setTimeout(() => {
        try {
          const currentState = useOfflineStore.getState();

          // Проверяем только если:
          // 1. Нет Network Information API
          // 2. Есть проблемы с сетью
          // 3. Нет реального соединения
          if (
            !(navigator as { connection?: unknown }).connection ||
            currentState.networkMetrics.consecutiveFailures > 0 ||
            !currentState.isActuallyConnected
          ) {
            if (process.env.NODE_ENV === "development") {
              console.warn(`🔄 Adaptive periodic check (failures: ${currentState.networkMetrics.consecutiveFailures}, quality: ${currentState.networkMetrics.quality})`);
            }

            currentState
              .checkExternalConnection()
              .then((isConnected) => {
                if (isConnected) {
                  if (process.env.NODE_ENV === "development") {
                    console.warn("✅ Adaptive check successful");
                  }
                } else {
                  if (process.env.NODE_ENV === "development") {
                    console.warn(`❌ Adaptive check failed, failure count: ${currentState.networkMetrics.consecutiveFailures}`);
                  }
                }
                
                // Планируем следующую проверку
                scheduleNextCheck();
              })
              .catch(() => {
                if (process.env.NODE_ENV === "development") {
                  console.warn(`❌ Adaptive check error, failure count: ${currentState.networkMetrics.consecutiveFailures}`);
                }
                
                // Планируем следующую проверку
                scheduleNextCheck();
              });
          } else {
            // Если все хорошо, планируем следующую проверку с базовым интервалом
            scheduleNextCheck();
          }
        } catch {
          // Игнорируем ошибки проверки соединения
          scheduleNextCheck();
        }
      }, adaptiveInterval);
    };
    
    // Запускаем первую проверку
    scheduleNextCheck();
  } catch (error) {
    console.warn("Error setting up adaptive connection check:", error);
  }

  // В dev режиме делаем дополнительную проверку при загрузке страницы
  if (process.env.NODE_ENV === "development") {
    // В dev режиме даем больше времени на инициализацию сети
    setTimeout(() => {
      try {
        const state = useOfflineStore.getState();
        if (state.isOnline && !state.isActuallyConnected) {
          console.warn("🔧 Dev mode: Performing initial network check...");
          state
            .checkExternalConnection()
            .then((isConnected) => {
              console.warn("🔧 Dev mode: Network check result:", isConnected);
              if (isConnected) {
                console.warn("🔧 Dev mode: Network is actually working, updating status");
              } else {
                console.warn(
                  "🔧 Dev mode: Network check failed, may be dev environment restrictions",
                );
              }
            })
            .catch((error) => {
              console.warn("🔧 Dev mode: Initial network check failed:", error);
            });
        } else {
          console.warn(
            "🔧 Dev mode: Initial network check skipped - online:",
            state.isOnline,
            "actually connected:",
            state.isActuallyConnected,
          );
        }
      } catch (error) {
        console.warn("🔧 Dev mode: Error in initial network check:", error);
      }
    }, 2000); // 2 секунды задержки в dev режиме
  }
}
