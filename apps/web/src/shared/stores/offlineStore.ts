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
  TrainingStatus,
} from "@gafus/types";

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      isOnline: typeof window !== "undefined" ? navigator.onLine : true,
      isStable: true,
      isActuallyConnected: false,
      syncQueue: [],
      lastSyncTime: null,
      syncErrors: [],
      maxRetries: 3,

      // Установка статуса онлайн/офлайн
      setOnlineStatus: (isOnline: boolean) => {
        const currentState = get();

        if (process.env.NODE_ENV === "development") {
          console.warn(`🌐 Setting online status: ${isOnline} (was: ${currentState.isOnline})`);
        }

        set({ isOnline });

        if (isOnline && typeof window !== "undefined") {
          // Если стали онлайн и мы в браузере, проверяем реальное соединение
          const checkDelay = process.env.NODE_ENV === "development" ? 500 : 100;

          if (process.env.NODE_ENV === "development") {
            console.warn(`⏰ Will check external connection in ${checkDelay}ms`);
          }

          setTimeout(() => {
            try {
              currentState
                .checkExternalConnection()
                .then((isConnected) => {
                  if (process.env.NODE_ENV === "development") {
                    console.warn(`🔍 External connection check result: ${isConnected}`);
                  }
                  if (isConnected && currentState.syncQueue.length > 0) {
                    // Если есть реальное соединение и есть действия в очереди, синхронизируем
                    currentState.syncOfflineActions();
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
          if (process.env.NODE_ENV === "development") {
            console.warn("🔴 Resetting actual connection flag");
          }
          set({ isActuallyConnected: false });
        }
      },

      // Установка стабильности сети
      setNetworkStability: (isStable: boolean) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`📶 Setting network stability: ${isStable}`);
        }
        set({ isStable });
      },

      // Установка реального состояния подключения
      setActualConnection: (isConnected: boolean) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`🔌 Setting actual connection: ${isConnected}`);
        }
        set({ isActuallyConnected: isConnected });
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
            setTimeout(() => {
              try {
                get().syncOfflineActions();
              } catch (error) {
                console.warn("Failed to sync offline actions:", error);
              }
            }, 100);
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

      // Проверка реального соединения через внешние сервисы
      checkExternalConnection: async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 сек таймаут

          if (process.env.NODE_ENV === "development") {
            console.warn("🔍 Checking external connection...");
          }

          // Сначала пробуем собственный API endpoint (работает в dev режиме)
          try {
            if (process.env.NODE_ENV === "development") {
              console.warn("🔍 Trying local API endpoint...");
            }

            const response = await fetch("/api/ping", {
              method: "GET",
              signal: controller.signal,
              cache: "no-cache",
            });

            if (response.ok) {
              clearTimeout(timeoutId);
              if (process.env.NODE_ENV === "development") {
                console.warn("✅ Local API check successful");
              }
              set({ isActuallyConnected: true });
              return true;
            }
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.warn("⚠️ Local API check failed:", error);
            }
            // Игнорируем ошибки собственного API, пробуем внешние сервисы
          }

          // Если локальный API недоступен, пробуем простую проверку через браузерный navigator.onLine
          // Это избегает проблем с прокси/firewall для внешних запросов
          if (process.env.NODE_ENV === "development") {
            console.warn("🔍 Local API unavailable, checking navigator.onLine...");
          }

          const navigatorOnline = typeof window !== "undefined" ? navigator.onLine : true;

          if (navigatorOnline) {
            // Попробуем один быстрый внешний запрос с коротким таймаутом
            try {
              const quickController = new AbortController();
              const quickTimeoutId = setTimeout(() => quickController.abort(), 1000); // 1 сек таймаут

              await fetch("https://www.google.com/favicon.ico", {
                method: "HEAD",
                signal: quickController.signal,
                mode: "no-cors",
                cache: "no-cache",
              });

              clearTimeout(quickTimeoutId);
              clearTimeout(timeoutId);

              if (process.env.NODE_ENV === "development") {
                console.warn("✅ External connectivity confirmed");
              }
              set({ isActuallyConnected: true });
              return true;
            } catch {
              // Если внешний запрос не работает (прокси/firewall), полагаемся на navigator.onLine
              if (process.env.NODE_ENV === "development") {
                console.warn("⚠️ External requests blocked, using navigator.onLine status");
              }
            }
          }

          // Полагаемся на navigator.onLine если внешние запросы заблокированы
          clearTimeout(timeoutId);
          const fallbackStatus = navigatorOnline;

          if (process.env.NODE_ENV === "development") {
            console.warn(`🔄 Using fallback status: ${fallbackStatus} (navigator.onLine)`);
          }

          set({ isActuallyConnected: fallbackStatus });
          return fallbackStatus;
        } catch (error) {
          // Игнорируем ошибки AbortError (таймаут)
          if (error instanceof Error && error.name === "AbortError") {
            if (process.env.NODE_ENV === "development") {
              console.warn("⏰ External network check timeout - assuming offline");
            }
          } else {
            console.warn("External network check failed:", error);
          }
          set({ isActuallyConnected: false });
          return false;
        }
      },

      // Синхронизация offline действий
      syncOfflineActions: async () => {
        try {
          const state = get();

          // Проверяем, что мы действительно онлайн и есть реальное соединение
          if (!state.isOnline || !state.isActuallyConnected || state.syncQueue.length === 0) {
            return;
          }

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

  // Периодическая проверка реального соединения только при необходимости
  // (например, если нет Network Information API или есть проблемы с сетью)
  try {
    let consecutiveFailures = 0;
    const maxFailures = 3;

    setInterval(() => {
      try {
        const state = useOfflineStore.getState();

        // Проверяем только если:
        // 1. Нет Network Information API
        // 2. Есть проблемы с сетью (несколько неудач подряд)
        // 3. Нет реального соединения
        if (
          !(navigator as { connection?: unknown }).connection ||
          consecutiveFailures >= maxFailures ||
          !state.isActuallyConnected
        ) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`🔄 Periodic connection check (failures: ${consecutiveFailures})`);
          }

          state
            .checkExternalConnection()
            .then((isConnected) => {
              if (isConnected) {
                consecutiveFailures = 0; // Сбрасываем счетчик неудач
                if (process.env.NODE_ENV === "development") {
                  console.warn("✅ Periodic check successful, resetting failure counter");
                }
              } else {
                consecutiveFailures++; // Увеличиваем счетчик неудач
                if (process.env.NODE_ENV === "development") {
                  console.warn(`❌ Periodic check failed, failure count: ${consecutiveFailures}`);
                }
              }
            })
            .catch(() => {
              consecutiveFailures++; // Увеличиваем счетчик неудач
              if (process.env.NODE_ENV === "development") {
                console.warn(`❌ Periodic check error, failure count: ${consecutiveFailures}`);
              }
            });
        }
      } catch {
        // Игнорируем ошибки проверки соединения
      }
    }, 300000); // Каждые 5 минут вместо 30 секунд
  } catch (error) {
    console.warn("Error setting up connection check interval:", error);
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
