import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import {
  deleteSubscriptionAction,
  updateSubscriptionAction,
} from "@shared/lib/actions/subscription";
import { getUserSubscriptionStatus } from "@shared/lib/savePushSubscription/getUserSubscriptionStatus";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { NotificationState } from "@gafus/types";

// ===== УТИЛИТЫ =====
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
};

const isNotificationSupported = () => {
  return typeof Notification !== "undefined";
};

const isPushSupported = () => {
  return "serviceWorker" in navigator && "PushManager" in window;
};

// ===== STORE =====
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      permission: null,
      subscription: null,
      hasServerSubscription: null,
      showModal: false,
      isLoading: false,
      error: null,
      disabledByUser: false,

      // ===== ДЕЙСТВИЯ =====
      initializePermission: () => {
        if (isNotificationSupported()) {
          const currentPermission = Notification.permission;
          set({ permission: currentPermission });
        } else {
          set({ permission: "default" });
        }
      },

      requestPermission: async (vapidPublicKey?: string) => {
        if (!isNotificationSupported()) {
          set({ error: "Этот браузер не поддерживает уведомления" });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const result = await Notification.requestPermission();
          set({
            permission: result,
            showModal: false,
            isLoading: false,
          });

          // Сохраняем в localStorage что модальное окно показывалось
          localStorage.setItem("notificationModalShown", "true");

          if (result === "granted" && vapidPublicKey) {
            // Автоматически настраиваем push-подписку
            await get().setupPushSubscription(vapidPublicKey);
          } else if (result === "granted") {
            // Пытаемся получить VAPID ключ автоматически, если его не передали
            try {
              const { publicKey } = await getPublicKeyAction();
              if (publicKey) {
                await get().setupPushSubscription(publicKey);
              } else {
                set({ error: "VAPID key not available for push subscription" });
              }
            } catch (e) {
              console.error("Failed to fetch VAPID public key:", e);
              set({ error: "VAPID key not available for push subscription" });
            }
          } else {
            set({ error: "Пользователь не разрешил уведомления" });
          }
        } catch (error) {
          console.error("Ошибка запроса разрешения уведомлений:", error);
          set({
            error: "Не удалось запросить разрешение",
            isLoading: false,
          });
        }
      },

      dismissModal: () => {
        set({ showModal: false });
        localStorage.setItem("notificationModalShown", "true");
      },

      setShowModal: (show) => {
        set({ showModal: show });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      // ===== PUSH ПОДПИСКА =====
      setupPushSubscription: async (vapidPublicKey: string) => {
        if (!isPushSupported()) {
          set({ error: "Push-уведомления не поддерживаются в этом браузере" });
          return;
        }

        if (!vapidPublicKey) {
          set({ error: "VAPID public key not available" });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // Просто ждем готовности Service Worker
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });

          const subscriptionJSON = subscription.toJSON();

          if (!subscriptionJSON.endpoint) {
            throw new Error("Subscription JSON has no endpoint");
          }

          if (!subscriptionJSON.keys) {
            throw new Error("Subscription JSON has no keys");
          }

          await updateSubscriptionAction({
            id: "", // Временно пустой ID, будет установлен сервером
            userId: "", // Временно пустой userId, будет установлен сервером
            endpoint: subscriptionJSON.endpoint,
            p256dh: subscriptionJSON.keys.p256dh,
            auth: subscriptionJSON.keys.auth,
            keys: {
              p256dh: subscriptionJSON.keys.p256dh,
              auth: subscriptionJSON.keys.auth,
            },
          });

          set({
            subscription,
            hasServerSubscription: true,
            isLoading: false,
          });
        } catch (error) {
          console.error("Error during push subscription:", error);
          set({
            error: "Не удалось настроить push-уведомления",
            isLoading: false,
          });
        }
      },

      checkServerSubscription: async () => {
        try {
          const { hasSubscription } = await getUserSubscriptionStatus();
          set({ hasServerSubscription: hasSubscription });
        } catch (error) {
          console.error("Ошибка при проверке подписки с сервера:", error);
          set({ hasServerSubscription: false });
        }
      },

      removePushSubscription: async () => {
        set({ isLoading: true, error: null });

        try {
          // Удаляем подписку с сервера
          await deleteSubscriptionAction();

          // Удаляем локальную подписку (если есть в сторе)
          if (get().subscription) {
            try {
              await get().subscription!.unsubscribe();
            } catch (error) {
              console.warn("Failed to unsubscribe from push subscription:", error);
            }
          }
          // На всякий случай снимаем активную подписку из Service Worker напрямую
          if (isPushSupported()) {
            try {
              const registration = await navigator.serviceWorker.ready;
              const existing = await registration.pushManager.getSubscription();
              if (existing) {
                try {
                  await existing.unsubscribe();
                } catch (error) {
                  console.warn("Failed to unsubscribe from existing push subscription:", error);
                }
              }
            } catch (error) {
              console.warn("Failed to unsubscribe from existing push subscription:", error);
            }
          }

          set({
            subscription: null,
            hasServerSubscription: false,
            isLoading: false,
            disabledByUser: true,
          });
        } catch (error) {
          console.error("Ошибка при удалении подписки:", error);
          set({
            error: "Не удалось удалить подписку",
            isLoading: false,
          });
        }
      },

      // Пытается автоматически восстановить подписку,
      // если у пользователя уже есть разрешение, но на сервере записи нет
      ensureActiveSubscription: async () => {
        try {
          if (!isPushSupported() || !isNotificationSupported()) return;

          const state = get();
          if (state.permission !== "granted") return;
          if (state.disabledByUser) return; // уважать явное отключение

          // Проверяем статус на сервере
          const status = await getUserSubscriptionStatus();
          if (status.hasSubscription) {
            set({ hasServerSubscription: true });
            return;
          }

          // Получаем актуальный VAPID ключ
          const { publicKey } = await getPublicKeyAction();
          if (!publicKey) return;

          // Ждём готовности SW и пробуем переоформить подписку
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          if (existing) {
            try {
              await existing.unsubscribe();
            } catch (error) {
              console.warn("Failed to unsubscribe from existing push subscription:", error);
            }
          }

          await get().setupPushSubscription(publicKey);
        } catch {
          // Тихо игнорируем, чтобы не мешать UX
        }
      },

      setDisabledByUser: (disabled: boolean) => {
        set({ disabledByUser: disabled });
        try {
          localStorage.setItem("notificationsDisabledByUser", disabled ? "1" : "0");
        } catch (error) {
          console.warn("Failed to set localStorage item:", error);
        }
      },

      // ===== УТИЛИТЫ =====
      isSupported: () => {
        return isNotificationSupported();
      },

      canRequest: () => {
        const state = get();
        // Показываем модальное окно если разрешение еще не запрошено (включая null)
        // или если разрешение было отклонено (чтобы дать возможность попробовать снова)
        return (
          (state.permission === null ||
            state.permission === "default" ||
            state.permission === "denied") &&
          isNotificationSupported()
        );
      },

      isGranted: () => {
        const state = get();
        return state.permission === "granted";
      },
    }),
    {
      name: "notification-storage",
      // Сохраняем только необходимые данные
      partialize: (state) => ({
        permission: state.permission,
        hasServerSubscription: state.hasServerSubscription,
        showModal: state.showModal,
        disabledByUser: state.disabledByUser,
      }),
    },
  ),
);

// ===== УТИЛИТАРНЫЕ ФУНКЦИИ =====
/**
 * Hook для автоматической инициализации уведомлений
 */
export function useNotificationInitializer() {
  const {
    initializePermission,
    checkServerSubscription,
    permission,
    hasServerSubscription,
    ensureActiveSubscription,
  } = useNotificationStore();

  // Инициализируем при монтировании
  useEffect(() => {
    initializePermission();
  }, [initializePermission]);

  // Проверяем серверную подписку при изменении разрешения
  useEffect(() => {
    if (permission === "granted") {
      checkServerSubscription();
    }
  }, [permission, checkServerSubscription]);

  // Если разрешение есть, но серверной подписки нет — пытаемся автоматически восстановить
  useEffect(() => {
    if (permission === "granted" && hasServerSubscription === false) {
      ensureActiveSubscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, hasServerSubscription]); // Убираем ensureActiveSubscription из зависимостей

  return { checkServerSubscription };
}

/**
 * Hook для показа модального окна уведомлений
 */
export function useNotificationModal() {
  const { showModal, setShowModal, permission } = useNotificationStore();

  useEffect(() => {
    // Восстанавливаем флаг пользовательского отключения из localStorage на клиенте
    try {
      const stored = localStorage.getItem("notificationsDisabledByUser");
      if (stored === "1") {
        useNotificationStore.getState().setDisabledByUser(true);
      }
    } catch (error) {
      console.warn("Failed to get localStorage item:", error);
    }

    // Модальное окно теперь управляется компонентом NotificationRequesterNew
    // Здесь только восстановление флагов
  }, [permission]);

  return { showModal, setShowModal };
}
