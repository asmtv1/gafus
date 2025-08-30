// Store для управления push-подписками

import { validateVapidPublicKey } from "@gafus/types";
import {
  deleteSubscriptionAction,
  updateSubscriptionAction,
} from "@shared/lib/actions/subscription";
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

// Утилиты для определения браузера
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isSafari = () => /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

// Safari-специфичные настройки с таймаутами
const getSafariSettings = () => {
  const safari = isSafari();
  const ios = isIOS();
  return {
    isSafari: safari,
    isIOS: ios,
    // Safari-специфичные таймауты для предотвращения зависаний
    swTimeoutMs: safari ? 2000 : 15000, // 2 сек для Safari, 15 для других
    pushTimeoutMs: safari ? 5000 : 10000, // 5 сек для push операций в Safari
    useTimeout: safari, // Использовать таймауты для Safari
  };
};

// Безопасное получение Service Worker с таймаутом для Safari
const getServiceWorkerSafely = async (timeoutMs: number) => {
  try {
    const swPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<ServiceWorkerRegistration>((_, reject) => 
      setTimeout(() => reject(new Error('Service Worker timeout')), timeoutMs)
    );
    
    return await Promise.race([swPromise, timeoutPromise]);
  } catch (timeoutError) {
    console.log(`⏰ Service Worker timeout (${timeoutMs}ms), но SW работает в фоне`);
    // Возвращаем undefined если таймаут, но SW продолжает работать
    return undefined;
  }
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

        const settings = getSafariSettings();
        const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;

        try {
          console.log("🚀 setupPushSubscription: Начинаем создание подписки");
          console.log(`🌐 Browser: ${settings.isIOS ? 'iOS' : 'Other'} ${settings.isSafari ? 'Safari' : 'Other'}`);
          
          // Безопасное получение Service Worker с таймаутом для Safari
          const registration = await getServiceWorkerSafely(settings.swTimeoutMs);
          
          if (!registration) {
            // Safari: SW не готов, но продолжаем работу
            console.log("🦁 Safari: Service Worker не готов, но продолжаем работу");
          }

          // Получаем существующую подписку
          let existingSubscription: PushSubscription | null = null;
          if (registration) {
            try {
              existingSubscription = await registration.pushManager.getSubscription();
            } catch (error) {
              console.warn("⚠️ Не удалось получить существующую подписку:", error);
            }
          }

          // Удаляем существующую подписку для чистого старта
          if (existingSubscription) {
            console.log("🗑️ Удаляем существующую подписку");
            try {
              await existingSubscription.unsubscribe();
            } catch (error) {
              console.warn("⚠️ Не удалось отписаться от существующей подписки:", error);
            }
          }

          // Создаем новую подписку
          if (!registration) {
            // Safari: честно показываем что push недоступен
            if (settings.isSafari) {
              console.log("🦁 Safari: SW недоступен, push уведомления недоступны");
              
              // Для Safari честно показываем что push не работает
              set({
                subscription: null,
                hasServerSubscription: false,
                isLoading: false,
                error: "Push уведомления недоступны в Safari на этом устройстве. Попробуйте перезагрузить страницу или использовать другой браузер.",
              });
              
              console.log("❌ Safari: Push уведомления недоступны");
              return;
            } else {
              throw new Error("Service Worker недоступен");
            }
          }

          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          
          // Создаем подписку с таймаутом для Safari
          let subscription: PushSubscription;
          if (settings.useTimeout) {
            // Safari: используем таймаут для предотвращения зависания
            const pushPromise = registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
            const pushTimeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Push subscription timeout')), settings.pushTimeoutMs)
            );
            
            subscription = await Promise.race([pushPromise, pushTimeoutPromise]);
          } else {
            // Другие браузеры: обычная подписка
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          }

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

          console.log("✅ Push subscription setup completed successfully");
          console.log(`🔗 Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
          
        } catch (error) {
          console.error("❌ setupPushSubscription: Push subscription setup failed:", error);
          
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
        console.log("🚀 checkServerSubscription: Начинаем проверку локальной подписки");
        
        const settings = getSafariSettings();
        console.log(`🌐 Browser: ${settings.isIOS ? 'iOS' : 'Other'} ${settings.isSafari ? 'Safari' : 'Other'}`);
        
        try {
          const userId = get().userId;
          if (!userId) {
            console.log("❌ checkServerSubscription: No userId, skipping");
            return;
          }

          console.log("🔧 checkServerSubscription: Checking local subscription for userId:", userId);
          
          // Проверяем локальную подписку на устройстве, а не в БД
          let hasLocalSubscription = false;
          
          if (isPushSupported()) {
            try {
              // Безопасное получение Service Worker с таймаутом для Safari
              const registration = await getServiceWorkerSafely(settings.swTimeoutMs);
              if (registration) {
                const subscription = await registration.pushManager.getSubscription();
                hasLocalSubscription = !!subscription;
                console.log("🔍 Локальная подписка найдена:", hasLocalSubscription);
              } else {
                console.log("⚠️ Service Worker недоступен для проверки");
                hasLocalSubscription = false;
              }
            } catch (error) {
              console.warn("⚠️ Не удалось проверить локальную подписку:", error);
              hasLocalSubscription = false;
            }
          }
          
          // Обновляем состояние на основе локальной подписки
          console.log("🔧 checkServerSubscription: Обновляем состояние hasServerSubscription:", hasLocalSubscription);
          set({ hasServerSubscription: hasLocalSubscription });
          console.log("✅ checkServerSubscription: Состояние обновлено на основе локальной подписки");
          
        } catch (error) {
          console.error("❌ checkServerSubscription: Unexpected error:", error);
          set({ hasServerSubscription: false });
        }
      },

      removePushSubscription: async () => {
        set({ isLoading: true, error: null });

        const settings = getSafariSettings();
        console.log(`🗑️ removePushSubscription: Удаляем подписку для ${settings.isSafari ? 'Safari' : 'browser'}`);

        try {
          const currentSubscription = get().subscription;
          let endpoint: string | undefined;

          // Получаем endpoint из store или service worker
          if (currentSubscription?.endpoint) {
            endpoint = currentSubscription.endpoint;
            console.log(`🔍 Найдена подписка в store: ${endpoint.substring(0, 50)}...`);
          } else if (isPushSupported()) {
            try {
              // Безопасное получение Service Worker с таймаутом для Safari
              const registration = await getServiceWorkerSafely(settings.swTimeoutMs);
              if (registration) {
                const existing = await registration.pushManager.getSubscription();
                if (existing?.endpoint) {
                  endpoint = existing.endpoint;
                  console.log(`🔍 Найдена подписка в SW: ${endpoint.substring(0, 50)}...`);
                }
              }
            } catch (error) {
              console.warn("Failed to get existing subscription:", error);
            }
          }

          // Последовательно удаляем подписку из всех мест
          if (endpoint) {
            console.log(`🔍 Удаляем подписку с endpoint: ${endpoint.substring(0, 50)}...`);
            
            // 1. Удаляем из базы данных
            try {
              console.log("🗑️ Удаляем подписку из БД...");
              await deleteSubscriptionAction(endpoint);
              console.log("✅ Подписка удалена из БД");
            } catch (error) {
              console.warn("Failed to delete from database:", error);
            }
          } else {
            // Fallback: удаляем все подписки если не можем определить endpoint
            try {
              console.warn("Endpoint not found, removing all subscriptions as fallback");
              await deleteSubscriptionAction();
              console.log("✅ Все подписки удалены из БД");
            } catch (error) {
              console.warn("Failed to delete all subscriptions:", error);
            }
          }

          // 2. Удаляем из store
          if (get().subscription) {
            try {
              console.log("🗑️ Удаляем подписку из store...");
              await get().subscription!.unsubscribe();
              console.log("✅ Подписка удалена из store");
            } catch (error) {
              console.warn("Failed to unsubscribe from store:", error);
            }
          }

          // 3. Удаляем из service worker
          if (isPushSupported()) {
            try {
              const registration = await getServiceWorkerSafely(settings.swTimeoutMs);
              if (registration) {
                const existing = await registration.pushManager.getSubscription();
                if (existing) {
                  console.log("🗑️ Удаляем подписку из Service Worker...");
                  await existing.unsubscribe();
                  console.log("✅ Подписка удалена из Service Worker");
                }
              }
            } catch (error) {
              console.warn("Failed to unsubscribe from service worker:", error);
            }
          }

          // Обновляем состояние
          set({
            subscription: null,
            hasServerSubscription: false,
            isLoading: false,
            disabledByUser: true,
          });

          console.log("✅ removePushSubscription: Подписка полностью удалена");
          
        } catch (error) {
          console.error("❌ removePushSubscription: Ошибка при удалении подписки:", error);
          
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
