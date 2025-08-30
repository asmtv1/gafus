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

// Утилиты для определения браузера
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isSafari = () => /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

// Safari-специфичные настройки
const getSafariSettings = () => {
  const safari = isSafari();
  const ios = isIOS();
  return {
    isSafari: safari,
    isIOS: ios,
    timeoutMs: safari ? 25000 : 15000, // 25 сек для Safari, 15 для остальных
    maxRetries: safari ? 2 : 1, // 2 попытки для Safari
    retryDelayMs: safari ? 2000 : 0, // 2 сек задержка для Safari
  };
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

        // Safari-специфичные настройки
        const settings = getSafariSettings();
        const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;

        try {
          console.log("🚀 setupPushSubscription: Начинаем создание подписки");
          console.log(`🌐 Browser: ${settings.isIOS ? 'iOS' : 'Other'} ${settings.isSafari ? 'Safari' : 'Other'}`);
          
          // Критическая проверка для Safari
          if (settings.isIOS && settings.isSafari) {
            console.log("🍎 iOS Safari detected");
            
            // Safari требует PWA режим для push-уведомлений
            if (!isStandalone) {
              const errorMessage = "Для push-уведомлений в Safari добавьте сайт в главный экран и запустите как приложение";
              console.warn("⚠️ Safari: PWA режим не активен");
              set({ 
                isLoading: false, 
                error: errorMessage 
              });
              return;
            }
            
            console.log("✅ Safari: PWA режим активен, создаем APNS подписку");
          }

          const registration = await navigator.serviceWorker.ready;
          const existingSubscription = await registration.pushManager.getSubscription();

          // Удаляем существующую подписку для чистого старта
          if (existingSubscription) {
            console.log("🗑️ Удаляем существующую подписку");
            await existingSubscription.unsubscribe();
            // Даем время браузеру обработать
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          
          // Создаем подписку с адаптивным таймаутом
          const subscriptionPromise = (async () => {
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

            // Критическая проверка endpoint для Safari
            if (settings.isIOS && settings.isSafari) {
              const isAPNSEndpoint = subscription.endpoint.includes('web.push.apple.com');
              console.log(`🔍 Safari endpoint check: ${isAPNSEndpoint ? 'APNS' : 'FCM'}`);
              
              if (!isAPNSEndpoint) {
                console.warn("⚠️ Safari создал FCM endpoint вместо APNS!");
                console.log("🔧 Принудительно создаем APNS подписку...");
                
                // Удаляем FCM подписку
                await subscription.unsubscribe();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Принудительно создаем APNS подписку
                let apnsSubscription: PushSubscription | null = null;
                let attempts = 0;
                const maxAttempts = 3;
                
                while (attempts < maxAttempts && !apnsSubscription) {
                  attempts++;
                  console.log(`🔄 Попытка ${attempts}/${maxAttempts} создания APNS подписки...`);
                  
                  try {
                    apnsSubscription = await registration.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey,
                    });
                    
                    if (apnsSubscription.endpoint.includes('web.push.apple.com')) {
                      console.log("✅ Успешно создана APNS подписка для Safari!");
                      break;
                    } else {
                      console.warn(`⚠️ Попытка ${attempts}: создан ${apnsSubscription.endpoint.includes('fcm.googleapis.com') ? 'FCM' : 'неизвестный'} endpoint`);
                      await apnsSubscription.unsubscribe();
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      apnsSubscription = null;
                    }
                  } catch (error) {
                    console.warn(`⚠️ Попытка ${attempts} не удалась:`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
                
                if (apnsSubscription && apnsSubscription.endpoint.includes('web.push.apple.com')) {
                  // Используем успешную APNS подписку
                  const apnsP256dh = apnsSubscription.getKey ? apnsSubscription.getKey("p256dh") : null;
                  const apnsAuth = apnsSubscription.getKey ? apnsSubscription.getKey("auth") : null;
                  
                  if (apnsP256dh && apnsAuth) {
                    const p256dhString = btoa(String.fromCharCode(...new Uint8Array(apnsP256dh)));
                    const authString = btoa(String.fromCharCode(...new Uint8Array(apnsAuth)));
                    
                    const userId = get().userId || "";
                    
                    await updateSubscriptionAction({
                      id: "",
                      userId,
                      endpoint: apnsSubscription.endpoint,
                      p256dh: p256dhString,
                      auth: authString,
                      keys: {
                        p256dh: p256dhString,
                        auth: authString,
                      },
                    });

                    set({
                      subscription: apnsSubscription,
                      hasServerSubscription: true,
                      isLoading: false,
                      error: null,
                    });

                    console.log("✅ Safari APNS push subscription setup completed successfully");
                    console.log(`🔗 APNS Endpoint: ${apnsSubscription.endpoint.substring(0, 50)}...`);
                    return;
                  }
                }
                
                // Если APNS не удалось создать, используем fallback
                console.warn("⚠️ Не удалось создать APNS подписку для Safari, используем fallback");
                throw new Error("Failed to create APNS subscription for Safari");
              }
            }

            // Используем созданную подписку (APNS для Safari или FCM для других)
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
            
            if (settings.isIOS && settings.isSafari) {
              console.log("🍎 Safari APNS подписка создана. Убедитесь что приложение запущено из главного экрана!");
            }
          })();

          // Адаптивный таймаут для Safari
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Setup push subscription timeout in ${settings.isSafari ? 'Safari' : 'browser'}`));
            }, settings.timeoutMs);
          });

          await Promise.race([subscriptionPromise, timeoutPromise]);
          
        } catch (error) {
          console.error("❌ setupPushSubscription: Push subscription setup failed:", error);
          
          let errorMessage = "Unknown error occurred";
          
          if (error instanceof Error) {
            if (error.message.includes("timeout")) {
              errorMessage = settings.isSafari 
                ? "Превышено время ожидания в Safari. Попробуйте еще раз."
                : "Превышено время ожидания. Попробуйте еще раз.";
              console.warn(`⚠️ ${settings.isSafari ? 'Safari' : 'Browser'} timeout - это нормально для push-уведомлений`);
            } else if (error.message.includes("APNS")) {
              errorMessage = "Не удалось создать подписку для Safari. Убедитесь, что приложение запущено из главного экрана.";
              console.warn("⚠️ Safari: APNS подписка не создана");
            } else if (error.message.includes("Service Worker")) {
              errorMessage = "Ошибка Service Worker. Попробуйте перезагрузить страницу.";
            } else if (error.message.includes("Subscribe")) {
              errorMessage = "Ошибка создания подписки. Проверьте подключение к интернету.";
            } else {
              errorMessage = error.message;
            }
          }
          
          // Специальные сообщения для iOS Safari
          if (settings.isIOS && settings.isSafari) {
            if (errorMessage.includes("timeout")) {
              errorMessage = "В iOS Safari уведомления могут работать медленно. Убедитесь, что приложение запущено из главного экрана.";
            } else if (errorMessage.includes("APNS")) {
              errorMessage = "В iOS Safari требуется PWA режим для push-уведомлений. Добавьте сайт в главный экран.";
            }
          }
          
          set({
            error: errorMessage,
            isLoading: false,
          });
        }
      },

      checkServerSubscription: async () => {
        console.log("🚀 checkServerSubscription: Начинаем проверку серверной подписки");
        
        const settings = getSafariSettings();
        console.log(`🌐 Browser: ${settings.isIOS ? 'iOS' : 'Other'} ${settings.isSafari ? 'Safari' : 'Other'}`);
        console.log(`⏰ checkServerSubscription: Таймаут установлен: ${settings.timeoutMs}ms`);
        
        let timeoutId: NodeJS.Timeout | undefined;
        
        try {
          const userId = get().userId;
          if (!userId) {
            console.log("❌ checkServerSubscription: No userId, skipping");
            return;
          }

          console.log("🔧 checkServerSubscription: Checking subscription for userId:", userId);
          
          // Используем AbortController для лучшего контроля таймаутов
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), settings.timeoutMs);
          
          try {
            // Progressive enhancement: сначала пробуем быструю проверку
            const status = await getUserSubscriptionStatus();
            console.log("✅ checkServerSubscription: Server subscription status checked:", status);
            
            // Критическая проверка для Safari - проверяем endpoint тип
            if (settings.isSafari && status.hasSubscription) {
              console.log("🔍 Safari: Проверяем endpoint тип...");
              
              try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                
                if (subscription) {
                  const isAPNSEndpoint = subscription.endpoint.includes('web.push.apple.com');
                  console.log(`🔍 Safari endpoint: ${isAPNSEndpoint ? 'APNS' : 'FCM'}`);
                  
                  if (!isAPNSEndpoint) {
                    console.warn("⚠️ Safari: Найдена FCM подписка вместо APNS!");
                    console.log("🔧 Safari: FCM подписка не будет работать, устанавливаем hasSubscription: false");
                    
                    // Для Safari FCM endpoint = нерабочая подписка
                    set({ hasServerSubscription: false });
                    return;
                  } else {
                    console.log("✅ Safari: APNS endpoint найден, подписка будет работать");
                  }
                } else {
                  console.warn("⚠️ Safari: Подписка в БД есть, но в браузере не найдена");
                  set({ hasServerSubscription: false });
                  return;
                }
              } catch (error) {
                console.warn("⚠️ Safari: Ошибка проверки endpoint:", error);
                // Продолжаем с результатом сервера
              }
            }
            
            // Обновляем состояние
            console.log("🔧 checkServerSubscription: Обновляем состояние hasServerSubscription:", status.hasSubscription);
            set({ hasServerSubscription: status.hasSubscription });
            console.log("✅ checkServerSubscription: Состояние обновлено");
            
          } catch (error) {
            // Graceful degradation для Safari
            if (settings.isSafari) {
              console.warn("⚠️ Safari: Первая попытка не удалась, пробуем retry логику");
              
              // Retry логика для Safari с exponential backoff
              let lastError: unknown = null;
              
              for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
                try {
                  console.log(`🔧 checkServerSubscription: Попытка ${attempt}/${settings.maxRetries}`);
                  
                  // Создаем новый AbortController для каждой попытки
                  const retryController = new AbortController();
                  const retryTimeoutId = setTimeout(() => retryController.abort(), settings.timeoutMs);
                  
                  try {
                    const status = await getUserSubscriptionStatus();
                    console.log("✅ checkServerSubscription: Retry успешен:", status);
                    
                    set({ hasServerSubscription: status.hasSubscription });
                    clearTimeout(retryTimeoutId);
                    return; // Успешно, выходим
                    
                  } catch (retryError) {
                    lastError = retryError;
                    clearTimeout(retryTimeoutId);
                    console.warn(`⚠️ checkServerSubscription: Попытка ${attempt} не удалась:`, retryError);
                    
                    if (attempt < settings.maxRetries) {
                      // Exponential backoff для Safari
                      const delayMs = settings.retryDelayMs * Math.pow(2, attempt - 1);
                      console.log(`⏳ checkServerSubscription: Ждем ${delayMs}ms перед следующей попыткой...`);
                      await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                  }
                } catch (retryError) {
                  lastError = retryError;
                  console.warn(`⚠️ checkServerSubscription: Ошибка в retry логике:`, retryError);
                }
              }
              
              // Все попытки исчерпаны для Safari
              console.error("❌ checkServerSubscription: Все попытки исчерпаны для Safari");
              console.warn("⚠️ Safari: Устанавливаем hasServerSubscription: false из-за ошибок");
              set({ hasServerSubscription: false });
              
            } else {
              // Для других браузеров просто устанавливаем false
              console.error("❌ checkServerSubscription: Failed for non-Safari browser:", error);
              set({ hasServerSubscription: false });
            }
          }
          
        } catch (error) {
          console.error("❌ checkServerSubscription: Unexpected error:", error);
          set({ hasServerSubscription: false });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      },

      removePushSubscription: async () => {
        set({ isLoading: true, error: null });


        const settings = getSafariSettings();
        console.log(`🗑️ removePushSubscription: Удаляем подписку для ${settings.isSafari ? 'Safari' : 'browser'}`);

        try {
          const currentSubscription = get().subscription;
          let endpoint: string | undefined;

          if (currentSubscription?.endpoint) {
            endpoint = currentSubscription.endpoint;
            console.log(`🔍 Найдена подписка в store: ${endpoint.substring(0, 50)}...`);
          } else if (isPushSupported()) {
            // Если нет текущей подписки в store, пытаемся получить из service worker
            try {
              const registration = await navigator.serviceWorker.ready;
              const existing = await registration.pushManager.getSubscription();
              if (existing?.endpoint) {
                endpoint = existing.endpoint;
                console.log(`🔍 Найдена подписка в SW: ${endpoint.substring(0, 50)}...`);
              }
            } catch (error) {
              console.warn("Failed to get existing subscription:", error);
            }
          }

          // Safari-специфичная логика удаления
          if (settings.isSafari && endpoint) {
            const isAPNSEndpoint = endpoint.includes('web.push.apple.com');
            console.log(`🍎 Safari: Удаляем ${isAPNSEndpoint ? 'APNS' : 'FCM'} подписку`);
            
            if (!isAPNSEndpoint) {
              console.warn("⚠️ Safari: Удаляем нерабочую FCM подписку");
            }
          }

          // Удаляем подписку из базы данных (только для конкретного устройства)
          if (endpoint) {
            console.log("🗑️ Удаляем подписку из БД...");
            await deleteSubscriptionAction(endpoint);
            console.log("✅ Подписка удалена из БД");
          } else {
            // Fallback: удаляем все подписки если не можем определить endpoint
            console.warn("Endpoint not found, removing all subscriptions as fallback");
            await deleteSubscriptionAction();
            console.log("✅ Все подписки удалены из БД");
          }

          // Удаляем подписку из браузера
          if (get().subscription) {
            try {
              console.log("🗑️ Удаляем подписку из store...");
              await get().subscription!.unsubscribe();
              console.log("✅ Подписка удалена из store");
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
                  console.log("🗑️ Удаляем подписку из Service Worker...");
                  await existing.unsubscribe();
                  console.log("✅ Подписка удалена из Service Worker");
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

          console.log("✅ removePushSubscription: Подписка полностью удалена");
          
        } catch (error) {
          console.error("❌ removePushSubscription: Ошибка при удалении подписки:", error);
          
          let errorMessage = "Не удалось удалить подписку";
          
          if (error instanceof Error) {
            if (error.message.includes("timeout")) {
              errorMessage = settings.isSafari 
                ? "Превышено время ожидания в Safari. Попробуйте еще раз."
                : "Превышено время ожидания. Попробуйте еще раз.";
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
