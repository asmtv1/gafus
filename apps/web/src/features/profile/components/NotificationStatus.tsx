"use client";

import { createWebLogger } from "@gafus/logger";
import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationComposite, useNotificationInitializer } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import styles from "./NotificationStatus.module.css";

// Создаем логгер для NotificationStatus
const logger = createWebLogger('web-notification-status');

export default function NotificationStatus() {
  const { data: session, status } = useSession();
  const {
    permission,
    hasServerSubscription,
    isLoading,
    error,
    requestPermission,
    removePushSubscription,
    isSupported,
    isGranted,
    checkServerSubscription,
    setUserId,
  } = useNotificationComposite();
  const [mounted, setMounted] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Инициализируем уведомления
  useNotificationInitializer();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAllowNotifications = async () => {
    
    
    // Проверяем поддержку push-уведомлений
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isWebKit = /webkit/i.test(navigator.userAgent);
    const isChrome = /chrome/i.test(navigator.userAgent);
    const isSafari = isWebKit && (/safari/i.test(navigator.userAgent) && !isChrome || isIOS);
    const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    
    // Современные версии Safari поддерживают push в браузере (с iOS 16.4+, macOS 13+)
    if (isSafari) {
      
      // Для старых версий iOS Safari (< 16.4) требуется PWA режим
      if (isIOS && !isStandalone) {
        // Проверяем поддержку push в браузере
        if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
          logger.warn("⚠️ Old iOS Safari: PWA mode required for push notifications", {
            operation: 'warn',
            userAgent: navigator.userAgent,
            hasPushManager: 'PushManager' in window,
            hasServiceWorker: 'serviceWorker' in navigator
          });
          alert("На данной версии iOS для push-уведомлений добавьте сайт на главный экран и запустите как приложение");
          return;
        }
      }
    }
    
    if (vapidKey) {
        
        
        try {
          // Добавляем таймаут для Safari, чтобы избежать зависания
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
            
              reject(new Error("Request permission timeout in Safari"));
            }, 30000); // Увеличиваем до 30 секунд для Safari
          });
          
          
          const permissionPromise = requestPermission(vapidKey);
          await Promise.race([permissionPromise, timeoutPromise]);
          
        } catch (error) {
          
          // В Safari часто бывают таймауты, показываем пользователю
          if (error instanceof Error && error.message.includes("timeout")) {
            logger.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально", {
              operation: 'warn',
              error: error.message,
              userAgent: navigator.userAgent
            });
            // Показываем пользователю информацию о таймауте
            alert("В Safari может потребоваться больше времени для настройки уведомлений. Попробуйте еще раз через несколько секунд.");
          } else if (error instanceof Error && error.message.includes("SW not available")) {
            logger.warn("⚠️ NotificationStatus: Service Worker недоступен в Safari", {
              operation: 'warn',
              error: error.message,
              userAgent: navigator.userAgent
            });
            alert("В Safari push-уведомления могут работать нестабильно. Добавьте сайт в главный экран для лучшей работы.");
          }
        }
    } else {
      console.error("❌ NotificationStatus: VAPID key not available");
    }
  };

  const handleDenyNotifications = async () => {
    
    try {
      // Адаптивные таймауты для разных браузеров
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const timeoutMs = isSafari ? 45000 : 30000; // 45 сек для Safari, 30 для остальных
      
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Remove subscription timeout in Safari"));
        }, timeoutMs);
      });
      
      const removePromise = removePushSubscription();
      await Promise.race([removePromise, timeoutPromise]);
      
    } catch (error) {
      console.error("❌ NotificationStatus: Ошибка при удалении подписки:", error);
      // В Safari часто бывают таймауты, показываем пользователю
      if (error instanceof Error && error.message.includes("timeout")) {
        logger.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально", {
          operation: 'warn',
          error: error.message,
          userAgent: navigator.userAgent,
          action: 'removeSubscription'
        });
        alert("В Safari может потребоваться больше времени для удаления подписки. Попробуйте еще раз через несколько секунд.");
      } else if (error instanceof Error && error.message.includes("SW not available")) {
        logger.warn("⚠️ NotificationStatus: Service Worker недоступен в Safari", {
          operation: 'warn',
          error: error.message,
          userAgent: navigator.userAgent,
          action: 'removeSubscription'
        });
        alert("В Safari push-уведомления могут работать нестабильно. Добавьте сайт в главный экран для лучшей работы.");
      }
    }
  };

  // Получаем публичный VAPID ключ и инициализируем push-уведомления при монтировании
  useEffect(() => {
    let cancelled = false;
    
    (async () => {
      try {
        const { publicKey } = await getPublicKeyAction();
        if (!cancelled) {
          setVapidKey(publicKey ?? null);
        }
        
        // Устанавливаем userId для push-уведомлений только если сессия загружена
        if (status === "authenticated" && session?.user?.id) {
          setUserId(session.user.id);
          
          // Проверяем серверную подписку только после установки userId
          setTimeout(() => {
            checkServerSubscription();
          }, 100);
        } else if (status === "loading") {
          // Сессия еще загружается, не логируем предупреждение
          return;
        } else {
          logger.warn("⚠️ NotificationStatus: No user ID found in session", {
            operation: 'warn',
            status,
            hasSession: !!session,
            hasUserId: !!session?.user?.id
          });
        }
      } catch {
        if (!cancelled) {
          setVapidKey(null);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, setUserId, checkServerSubscription]);

  // Если пользователь не авторизован, не показываем ничего
  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  // Если уведомления не поддерживаются, показываем сообщение
  if (mounted && !isSupported()) {
    return (
      <div className={styles.container}>
        <h3>Уведомления</h3>
        <p>Этот браузер не поддерживает уведомления.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3>Уведомления</h3>

      {error && (
        <div
          style={{
            color: "red",
            fontSize: "14px",
            marginBottom: "10px",
          }}
        >
          Ошибка: {error}
        </div>
      )}

      <div className={styles.status}>
        <div className={styles.statusItem}>
          <strong>Разрешение браузера: </strong>
          <span className={styles.statusValue}>
            {mounted
              ? permission === "granted"
                ? "✅ Разрешено"
                : permission === "denied"
                  ? "❌ Отклонено"
                  : "⏳ Не запрошено"
              : "⏳ Загрузка..."}
          </span>
        </div>

        <div className={styles.statusItem}>
          <strong>Серверная подписка:</strong>
          <span className={styles.statusValue}>
            {mounted ? hasServerSubscription === true && "✅ Активна" : "⏳ Загрузка..."}
            {mounted ? hasServerSubscription === false && "❌ Неактивна" : ""}
            {mounted ? hasServerSubscription === null && "⏳ Проверяется..." : ""}
          </span>
        </div>
      </div>

      {mounted && (
        <div className={styles.actions}>
          {/* Показываем кнопку "Разрешить" если разрешение не запрошено */}
          {permission === "default" && (
            <button
              onClick={handleAllowNotifications}
              disabled={isLoading}
              className={styles.allowButton}
            >
              {isLoading ? "Загрузка..." : "Разрешить уведомления"}
            </button>
          )}

          {/* Показываем кнопку "Включить подписку" если разрешение есть, но подписка отключена */}
          {isGranted() && hasServerSubscription === false && (
            <button
              onClick={handleAllowNotifications}
              disabled={isLoading}
              className={styles.allowButton}
            >
              {isLoading ? "Загрузка..." : "Включить подписку"}
            </button>
          )}

          {/* Показываем кнопку "Отключить" если разрешение есть и подписка активна */}
          {isGranted() && hasServerSubscription === true && (
            <button
              onClick={handleDenyNotifications}
              disabled={isLoading}
              className={styles.denyButton}
            >
              {isLoading ? "Загрузка..." : "Отключить уведомления"}
            </button>
          )}

          {/* Показываем кнопку "Включить подписку" если разрешение есть, но подписка не проверена */}
          {isGranted() && hasServerSubscription === null && (
            <button
              onClick={handleAllowNotifications}
              disabled={isLoading}
              className={styles.allowButton}
            >
              {isLoading ? "Загрузка..." : "Включить подписку"}
            </button>
          )}

          {permission === "denied" && (
            <div className={styles.help}>
              <p>Уведомления заблокированы в браузере.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
