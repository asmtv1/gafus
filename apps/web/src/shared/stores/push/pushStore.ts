// Store для управления push-подписками

import { validateVapidPublicKey } from "@gafus/types";
import {
  deleteSubscriptionAction,
  updateSubscriptionAction,
} from "@shared/lib/actions/subscription";
import serviceWorkerManager from "@shared/utils/serviceWorkerManager";
import { createWebLogger } from "@gafus/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Создаем логгер для push store
const logger = createWebLogger("web-push-store");

interface PushState {
  subscription: PushSubscription | null;
  hasServerSubscription: boolean | null;
  isLoading: boolean;
  error: string | null;
  disabledByUser: boolean;
  userId: string;

  // Действия
  setupPushSubscription: (vapidPublicKey: string) => Promise<void>;
  checkServerSubscription: () => Promise<void>;
  removePushSubscription: () => Promise<void>;
  ensureActiveSubscription: () => Promise<void>;
  setDisabledByUser: (disabled: boolean) => void;
  setUserId: (userId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Утилиты
  isSupported: () => boolean;
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char: string) => char.charCodeAt(0)));
};

const isNotificationSupported = () => {
  return typeof Notification !== "undefined";
};

export const usePushStore = create<PushState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      subscription: null,
      hasServerSubscription: null,
      isLoading: false,
      error: null,
      disabledByUser: false,
      userId: "",

      // Действия
      setupPushSubscription: async (vapidPublicKey: string) => {
        if (!serviceWorkerManager.isSupported()) {
          set({ error: "Push-уведомления не поддерживаются в этом браузере" });
          return;
        }

        if (!vapidPublicKey) {
          set({ error: "VAPID public key not available" });
          return;
        }

        if (!validateVapidPublicKey(vapidPublicKey)) {
          set({ error: "Invalid VAPID public key format" });
          return;
        }

        set({ isLoading: true, error: null });

        let registration: ServiceWorkerRegistration | null = null;
        try {
          registration = await serviceWorkerManager.register();

          // Проверяем доступность pushManager
          if (!registration.pushManager) {
            throw new Error("Push Manager недоступен в этом браузере");
          }

          // Получаем существующую подписку
          let existingSubscription: PushSubscription | null = null;
          try {
            existingSubscription = await registration.pushManager.getSubscription();
          } catch (error) {
            logger.warn("⚠️ Не удалось получить существующую подписку", {
              operation: "get_existing_subscription_error",
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Если подписка уже существует, проверяем есть ли она в БД
          if (existingSubscription) {
            try {
              const { getUserSubscriptions } = await import(
                "@shared/lib/savePushSubscription/getUserSubscriptionStatus"
              );
              const { subscriptions } = await getUserSubscriptions();

              // Проверяем, есть ли локальный endpoint в БД
              const isInDatabase = subscriptions.some(
                (sub: { endpoint: string }) => sub.endpoint === existingSubscription!.endpoint,
              );

              if (isInDatabase) {
                set({
                  subscription: existingSubscription,
                  hasServerSubscription: true,
                  isLoading: false,
                  error: null,
                });
                return;
              } else {
                // Обновляем БД с существующей подпиской
                const p256dh = existingSubscription.getKey
                  ? existingSubscription.getKey("p256dh")
                  : null;
                const auth = existingSubscription.getKey
                  ? existingSubscription.getKey("auth")
                  : null;

                if (!existingSubscription.endpoint) {
                  throw new Error("Existing subscription has no endpoint");
                }

                if (!p256dh || !auth) {
                  throw new Error("Existing subscription keys are incomplete");
                }

                const p256dhString = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
                const authString = btoa(String.fromCharCode(...new Uint8Array(auth)));

                const userId = get().userId || "";

                await updateSubscriptionAction({
                  id: "",
                  userId,
                  endpoint: existingSubscription.endpoint,
                  p256dh: p256dhString,
                  auth: authString,
                  keys: {
                    p256dh: p256dhString,
                    auth: authString,
                  },
                });

                set({
                  subscription: existingSubscription,
                  hasServerSubscription: true,
                  isLoading: false,
                  error: null,
                });

                return;
              }
            } catch (error) {
              logger.warn("Ошибка проверки БД, продолжаем создание новой подписки", {
                operation: "check_db_error_continue_subscription",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Если локальной подписки нет или она не в БД, создаем новую
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });

          const p256dh = subscription.getKey ? subscription.getKey("p256dh") : null;
          const auth = subscription.getKey ? subscription.getKey("auth") : null;

          if (!subscription.endpoint) {
            throw new Error("Subscription has no endpoint");
          }

          if (!p256dh || !auth) {
            throw new Error("Subscription keys are incomplete");
          }

          const p256dhString = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
          const authString = btoa(String.fromCharCode(...new Uint8Array(auth)));

          const userId = get().userId || "";

          await updateSubscriptionAction({
            id: "",
            userId,
            endpoint: subscription.endpoint,
            p256dh: p256dhString,
            auth: authString,
            keys: {
              p256dh: p256dhString,
              auth: authString,
            },
          });

          set({
            subscription,
            hasServerSubscription: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          logger.error("Push subscription setup failed", error as Error, {
            operation: "push_subscription_setup_failed",
            publicKey: vapidPublicKey,
            hasRegistration: !!registration,
          });

          let errorMessage = "Unknown error occurred";

          if (error instanceof Error) {
            if (error.message.includes("Service Worker")) {
              errorMessage = "Ошибка Service Worker. Попробуйте перезагрузить страницу.";
            } else if (error.message.includes("timeout")) {
              errorMessage = "Таймаут операции. Попробуйте еще раз.";
            } else if (error.message.includes("Subscribe")) {
              errorMessage = "Ошибка создания подписки. Проверьте подключение к интернету.";
            } else {
              errorMessage = error.message;
            }
          }

          set({
            error: errorMessage,
            isLoading: false,
          });
        }
      },

      checkServerSubscription: async () => {
        try {
          const userId = get().userId;
          if (!userId) {
            return;
          }

          // Проверяем локальную подписку
          let localSubscription = null;
          let hasLocalSubscription = false;

          if (serviceWorkerManager.isSupported()) {
            try {
              const registration = await serviceWorkerManager.getRegistration();
              if (registration) {
                localSubscription = await registration.pushManager.getSubscription();
                hasLocalSubscription = !!localSubscription;
              } else {
                hasLocalSubscription = false;
              }
            } catch (error) {
              logger.warn("Не удалось проверить локальную подписку", {
                operation: "check_local_subscription_error",
                error: error instanceof Error ? error.message : String(error),
              });
              hasLocalSubscription = false;
            }
          }

          // Если локальной подписки нет, то и серверной быть не должно
          if (!hasLocalSubscription) {
            set({ hasServerSubscription: false });
            return;
          }

          // Проверяем, есть ли локальная подписка в БД
          try {
            const { getUserSubscriptionStatus } = await import(
              "@shared/lib/savePushSubscription/getUserSubscriptionStatus"
            );
            const { hasSubscription } = await getUserSubscriptionStatus();

            // Проверяем соответствие endpoint'ов
            let endpointMatches = false;
            if (localSubscription && hasSubscription) {
              // Получаем все подписки пользователя из БД
              const { getUserSubscriptions } = await import(
                "@shared/lib/savePushSubscription/getUserSubscriptionStatus"
              );
              const { subscriptions } = await getUserSubscriptions();

              // Проверяем, есть ли локальный endpoint в БД
              endpointMatches = subscriptions.some(
                (sub: { endpoint: string }) => sub.endpoint === localSubscription!.endpoint,
              );
            }

            // Состояние синхронизировано, если есть и локальная подписка, и соответствующая запись в БД
            const isSynced = hasLocalSubscription && hasSubscription && endpointMatches;

            set({ hasServerSubscription: isSynced });
          } catch (error) {
            // Если пользователь не авторизован, это нормально - молча выходим
            if (error instanceof Error && error.message === "Пользователь не авторизован") {
              set({ hasServerSubscription: false });
              return;
            }

            // warn: в dev БД/сессия могут быть недоступны — не слать в error-dashboard
            logger.warn("Ошибка проверки БД подписки", {
              operation: "check_db_error",
              hasLocalSubscription: hasLocalSubscription,
              error: error instanceof Error ? error.message : String(error),
            });
            // В случае ошибки БД, полагаемся только на локальную подписку
            set({ hasServerSubscription: hasLocalSubscription });
          }
        } catch (error) {
          logger.warn("checkServerSubscription failed", {
            operation: "check_server_subscription_unexpected_error",
            error: error instanceof Error ? error.message : String(error),
          });
          set({ hasServerSubscription: false });
        }
      },

      removePushSubscription: async () => {
        set({ isLoading: true, error: null });

        try {
          const currentSubscription = get().subscription;
          let endpoint: string | undefined;

          // Получаем endpoint из store или service worker
          if (currentSubscription?.endpoint) {
            endpoint = currentSubscription.endpoint;
          } else if (serviceWorkerManager.isSupported()) {
            try {
              // Получаем Service Worker через универсальный менеджер
              const registration = await serviceWorkerManager.getRegistration();
              if (registration) {
                const existing = await registration.pushManager.getSubscription();
                if (existing?.endpoint) {
                  endpoint = existing.endpoint;
                }
              }
            } catch (error) {
              logger.warn("Failed to get existing subscription", {
                operation: "get_existing_subscription_failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Последовательно удаляем подписку из всех мест
          if (endpoint) {
            // 1. Удаляем из базы данных
            try {
              await deleteSubscriptionAction(endpoint);
            } catch (error) {
              logger.warn("Failed to delete from database", {
                operation: "delete_from_database_failed",
                endpoint: endpoint,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else {
            // Fallback: удаляем все подписки если не можем определить endpoint
            try {
              logger.warn("Endpoint not found, removing all subscriptions as fallback", {
                operation: "endpoint_not_found_fallback",
              });
              await deleteSubscriptionAction();
            } catch (error) {
              logger.warn("Failed to delete all subscriptions", {
                operation: "delete_all_subscriptions_failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // 2. Удаляем из store
          if (get().subscription) {
            try {
              await get().subscription!.unsubscribe();
            } catch (error) {
              logger.warn("Failed to unsubscribe from store", {
                operation: "unsubscribe_from_store_failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // 3. Удаляем из service worker
          if (serviceWorkerManager.isSupported()) {
            try {
              const registration = await serviceWorkerManager.getRegistration();
              if (registration) {
                const existing = await registration.pushManager.getSubscription();
                if (existing) {
                  await existing.unsubscribe();
                }
              }
            } catch (error) {
              logger.warn("Failed to unsubscribe from service worker", {
                operation: "unsubscribe_from_service_worker_failed",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Обновляем состояние
          set({
            subscription: null,
            hasServerSubscription: false,
            isLoading: false,
            disabledByUser: true,
          });
        } catch (error) {
          logger.error("Ошибка при удалении подписки", error as Error, {
            operation: "delete_subscription_error",
          });

          let errorMessage = "Не удалось удалить подписку";

          if (error instanceof Error) {
            if (error.message.includes("timeout")) {
              errorMessage = "Таймаут операции. Попробуйте еще раз.";
            } else if (error.message.includes("network")) {
              errorMessage = "Ошибка сети. Проверьте подключение к интернету.";
            } else {
              errorMessage = error.message;
            }
          }

          set({
            error: errorMessage,
            isLoading: false,
          });
        }
      },

      ensureActiveSubscription: async () => {
        let publicKey: string | null = null; // Moved declaration outside try block
        try {
          if (!serviceWorkerManager.isSupported() || !isNotificationSupported()) return;

          const state = get();
          if (state.disabledByUser) return;

          // Сначала проверяем, есть ли уже синхронизированная подписка
          if (state.hasServerSubscription === true) {
            return;
          }

          // Проверяем, есть ли локальная подписка, которую можно синхронизировать
          if (serviceWorkerManager.isSupported()) {
            try {
              const registration = await serviceWorkerManager.getRegistration();
              if (registration) {
                const localSubscription = await registration.pushManager.getSubscription();
                if (localSubscription) {
                  // Проверяем, есть ли эта подписка в БД
                  const { getUserSubscriptions } = await import(
                    "@shared/lib/savePushSubscription/getUserSubscriptionStatus"
                  );
                  const { subscriptions } = await getUserSubscriptions();

                  const isInDatabase = subscriptions.some(
                    (sub: { endpoint: string }) => sub.endpoint === localSubscription.endpoint,
                  );

                  if (isInDatabase) {
                    set({
                      subscription: localSubscription,
                      hasServerSubscription: true,
                    });
                    return;
                  } else {
                    // Синхронизируем существующую подписку
                    const p256dh = localSubscription.getKey
                      ? localSubscription.getKey("p256dh")
                      : null;
                    const auth = localSubscription.getKey ? localSubscription.getKey("auth") : null;

                    if (localSubscription.endpoint && p256dh && auth) {
                      const p256dhString = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
                      const authString = btoa(String.fromCharCode(...new Uint8Array(auth)));

                      const userId = get().userId || "";

                      await updateSubscriptionAction({
                        id: "",
                        userId,
                        endpoint: localSubscription.endpoint,
                        p256dh: p256dhString,
                        auth: authString,
                        keys: {
                          p256dh: p256dhString,
                          auth: authString,
                        },
                      });

                      set({
                        subscription: localSubscription,
                        hasServerSubscription: true,
                      });

                      return;
                    }
                  }
                }
              }
            } catch (error) {
              logger.warn("Ошибка проверки локальной подписки", {
                operation: "check_local_subscription_error_ensure",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Если локальной подписки нет или она не синхронизирована, создаем новую
          const { getPublicKeyAction } = await import("@shared/lib/actions/publicKey");
          const { publicKey: key } = await getPublicKeyAction();
          publicKey = key;

          if (publicKey) {
            await get().setupPushSubscription(publicKey);
          }
        } catch (error) {
          logger.error("Failed to ensure active subscription", error as Error, {
            operation: "ensure_active_subscription_failed",
            publicKey: publicKey,
          });
        }
      },

      setDisabledByUser: (disabled) => {
        set({ disabledByUser: disabled });
        localStorage.setItem("notificationsDisabledByUser", disabled ? "1" : "0");
      },

      setUserId: (userId: string) => {
        set({ userId });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      // Утилиты
      isSupported: () => {
        return serviceWorkerManager.isSupported();
      },
    }),
    {
      name: "push-storage",
      partialize: (state) => ({
        hasServerSubscription: state.hasServerSubscription,
        disabledByUser: state.disabledByUser,
        userId: state.userId,
      }),
    },
  ),
);
