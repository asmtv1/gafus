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
      userId: "",

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

          // НЕ удаляем существующую подписку - позволяем иметь несколько подписок
          // if (existingSubscription) {
          //   await existingSubscription.unsubscribe();
          // }

          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          
          // Проверяем Safari на iOS
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
          const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
          
          if (isIOS && isSafari) {
            console.log("🍎 iOS Safari detected");
            
            // Для Safari критически важно быть в PWA режиме
            if (!isStandalone) {
              set({ 
                isLoading: false, 
                error: "Для push-уведомлений в Safari добавьте сайт в главный экран и запустите как приложение" 
              });
              return;
            }
            
            console.log("✅ PWA режим активен, создаем подписку для Safari");
          }

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

          // Проверяем endpoint для Safari
          if (isIOS && isSafari) {
            const isAPNSEndpoint = subscription.endpoint.includes('web.push.apple.com');
            if (!isAPNSEndpoint) {
              console.warn("⚠️ Safari создал FCM endpoint вместо APNS!");
              console.warn("🔧 Попробуем принудительно создать APNS подписку...");
              
              // Принудительно создаем подписку для Safari
              try {
                await subscription.unsubscribe();
                
                // Создаем новую подписку с принудительным APNS
                const safariSubscription = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey,
                });
                
                if (safariSubscription.endpoint.includes('web.push.apple.com')) {
                  console.log("✅ Успешно создана APNS подписка для Safari!");
                  // Используем Safari подписку
                  const safariP256dh = safariSubscription.getKey ? safariSubscription.getKey("p256dh") : null;
                  const safariAuth = safariSubscription.getKey ? safariSubscription.getKey("auth") : null;
                  
                  if (safariP256dh && safariAuth) {
                    const p256dhString = btoa(String.fromCharCode(...new Uint8Array(safariP256dh)));
                    const authString = btoa(String.fromCharCode(...new Uint8Array(safariAuth)));
                    
                    const userId = get().userId || "";
                    
                    await updateSubscriptionAction({
                      id: "",
                      userId,
                      endpoint: safariSubscription.endpoint,
                      p256dh: p256dhString,
                      auth: authString,
                      keys: {
                        p256dh: p256dhString,
                        auth: authString,
                      },
                    });
                    
                    set({
                      subscription: safariSubscription,
                      hasServerSubscription: true,
                      isLoading: false,
                      error: null,
                    });
                    
                    console.log("✅ Safari APNS подписка сохранена!");
                    return;
                  }
                }
              } catch (safariError) {
                console.error("❌ Не удалось создать APNS подписку:", safariError);
              }
            } else {
              console.log("✅ Safari создал правильный APNS endpoint");
            }
          }

          const p256dhString = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
          const authString = btoa(String.fromCharCode(...new Uint8Array(auth)));

          // Получаем userId из текущего состояния или из другого источника
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

          console.log("✅ Push subscription setup completed successfully");
          console.log(`🔗 Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
          
          if (isIOS && isSafari) {
            console.log("🍎 Safari подписка создана. Убедитесь что приложение запущено из главного экрана!");
          }
        } catch (error) {
          console.error("❌ Push subscription setup failed:", error);
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      },

      checkServerSubscription: async () => {
        try {
          const userId = get().userId;
          if (!userId) return;

          const status = await getUserSubscriptionStatus();
          console.log("Server subscription status checked:", status);
        } catch (error) {
          console.error("Failed to check server subscription:", error);
        }
      },

      removePushSubscription: async () => {
        set({ isLoading: true, error: null });

        try {
          const currentSubscription = get().subscription;
          let endpoint: string | undefined;

          if (currentSubscription?.endpoint) {
            endpoint = currentSubscription.endpoint;
          } else if (isPushSupported()) {
            // Если нет текущей подписки в store, пытаемся получить из service worker
            try {
              const registration = await navigator.serviceWorker.ready;
              const existing = await registration.pushManager.getSubscription();
              if (existing?.endpoint) {
                endpoint = existing.endpoint;
              }
            } catch (error) {
              console.warn("Failed to get existing subscription:", error);
            }
          }

          // Удаляем подписку из базы данных (только для конкретного устройства)
          if (endpoint) {
            await deleteSubscriptionAction(endpoint);
          } else {
            // Fallback: удаляем все подписки если не можем определить endpoint
            console.warn("Endpoint not found, removing all subscriptions as fallback");
            await deleteSubscriptionAction();
          }

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
        return isPushSupported();
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
