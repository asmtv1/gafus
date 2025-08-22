// Store для управления push-подписками

import { validateVapidPublicKey } from "@gafus/types";
import {
  deleteSubscriptionAction,
  updateSubscriptionAction,
} from "@shared/lib/actions/subscription";
import { getUserSubscriptionStatus } from "@shared/lib/savePushSubscription/getUserSubscriptionStatus";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PushState {
  subscription: PushSubscription | null;
  hasServerSubscription: boolean | null;
  isLoading: boolean;
  error: string | null;
  disabledByUser: boolean;

  // Действия
  setupPushSubscription: (vapidPublicKey: string) => Promise<void>;
  checkServerSubscription: () => Promise<void>;
  removePushSubscription: () => Promise<void>;
  ensureActiveSubscription: () => Promise<void>;
  setDisabledByUser: (disabled: boolean) => void;
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

const isPushSupported = () => {
  return "serviceWorker" in navigator && "PushManager" in window;
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

      // Действия
      setupPushSubscription: async (vapidPublicKey: string) => {
        if (!isPushSupported()) {
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

        try {
          const registration = await navigator.serviceWorker.ready;
          const existingSubscription = await registration.pushManager.getSubscription();

          if (existingSubscription) {
            await existingSubscription.unsubscribe();
          }

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

          await updateSubscriptionAction({
            id: "",
            userId: "",
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
          });
        } catch (error) {
          console.error("Ошибка создания push-подписки:", error);

          let errorMessage = "Не удалось настроить push-уведомления";
          if (error instanceof Error) {
            if (error.message.includes("keys")) {
              errorMessage = "Ошибка создания ключей подписки";
            } else if (error.message.includes("endpoint")) {
              errorMessage = "Ошибка создания endpoint подписки";
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
          await deleteSubscriptionAction();

          if (get().subscription) {
            try {
              await get().subscription!.unsubscribe();
            } catch (error) {
              console.warn("Failed to unsubscribe from push subscription:", error);
            }
          }

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

      ensureActiveSubscription: async () => {
        try {
          if (!isPushSupported() || !isNotificationSupported()) return;

          const state = get();
          if (state.disabledByUser) return;

          // Логика восстановления подписки
          const { getPublicKeyAction } = await import("@shared/lib/actions/publicKey");
          const { publicKey } = await getPublicKeyAction();

          if (publicKey) {
            await get().setupPushSubscription(publicKey);
          }
        } catch (error) {
          console.error("Failed to ensure active subscription:", error);
        }
      },

      setDisabledByUser: (disabled) => {
        set({ disabledByUser: disabled });
        localStorage.setItem("notificationsDisabledByUser", disabled ? "1" : "0");
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      // Утилиты
      isSupported: () => {
        return isPushSupported();
      },
    }),
    {
      name: "push-storage",
      partialize: (state) => ({
        hasServerSubscription: state.hasServerSubscription,
        disabledByUser: state.disabledByUser,
      }),
    },
  ),
);
