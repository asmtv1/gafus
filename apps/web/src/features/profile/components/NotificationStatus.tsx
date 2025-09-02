"use client";

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationComposite, useNotificationInitializer } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import styles from "./NotificationStatus.module.css";

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
    console.log("🚀 NotificationStatus: handleAllowNotifications вызван");
    
    // Проверяем поддержку push-уведомлений
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isWebKit = /webkit/i.test(navigator.userAgent);
    const isChrome = /chrome/i.test(navigator.userAgent);
    const isSafari = isWebKit && (/safari/i.test(navigator.userAgent) && !isChrome || isIOS);
    const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    
    // Современные версии Safari поддерживают push в браузере (с iOS 16.4+, macOS 13+)
    if (isSafari) {
      console.log("🦁 Safari/WebKit detected");
      console.log("🔧 iOS:", isIOS);
      console.log("🔧 PWA standalone mode:", isStandalone);
      console.log("🔧 HTTPS:", window.location.protocol === 'https:');
      console.log("🔧 Service Worker supported:", 'serviceWorker' in navigator);
      console.log("🔧 Push Manager supported:", 'PushManager' in window);
      
      // Обязательное требование HTTPS для push
      //if (window.location.protocol !== 'https:') {
        //console.error("❌ Safari requires HTTPS for push notifications");
        //alert("Для push-уведомлений требуется HTTPS соединение");
        //return;
      //}
      
      // Для старых версий iOS Safari (< 16.4) требуется PWA режим
      if (isIOS && !isStandalone) {
        // Проверяем поддержку push в браузере
        if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
          console.warn("⚠️ Old iOS Safari: PWA mode required for push notifications");
          alert("На данной версии iOS для push-уведомлений добавьте сайт на главный экран и запустите как приложение");
          return;
        }
      }
    }
    
    if (vapidKey) {
        console.log("✅ NotificationStatus: VAPID ключ доступен, запрашиваем разрешение");
        
        try {
          // Добавляем таймаут для Safari, чтобы избежать зависания
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              console.log("⏰ NotificationStatus: Таймаут истек для Safari!");
              reject(new Error("Request permission timeout in Safari"));
            }, 30000); // Увеличиваем до 30 секунд для Safari
          });
          
          console.log("🔧 NotificationStatus: Вызываем requestPermission...");
          const permissionPromise = requestPermission(vapidKey);
          await Promise.race([permissionPromise, timeoutPromise]);
          console.log("✅ NotificationStatus: Разрешение получено успешно");
        } catch (error) {
          console.error("❌ NotificationStatus: Ошибка при запросе разрешения:", error);
          // В Safari часто бывают таймауты, показываем пользователю
          if (error instanceof Error && error.message.includes("timeout")) {
            console.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально");
            // Показываем пользователю информацию о таймауте
            alert("В Safari может потребоваться больше времени для настройки уведомлений. Попробуйте еще раз через несколько секунд.");
          } else if (error instanceof Error && error.message.includes("SW not available")) {
            console.warn("⚠️ NotificationStatus: Service Worker недоступен в Safari");
            alert("В Safari push-уведомления могут работать нестабильно. Добавьте сайт в главный экран для лучшей работы.");
          }
        }
    } else {
      console.error("❌ NotificationStatus: VAPID key not available");
    }
  };

  const handleDenyNotifications = async () => {
    console.log("🚀 NotificationStatus: handleDenyNotifications вызван");
    
    // Специальная диагностика для Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (isIOS && isSafari) {
      console.log("🍎 iOS Safari detected for deny operation");
    }
    
    try {
      // Адаптивные таймауты для разных браузеров
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const timeoutMs = isSafari ? 45000 : 30000; // 45 сек для Safari, 30 для остальных
      
      console.log(`⏰ NotificationStatus: Таймаут для удаления установлен: ${timeoutMs}ms (${isSafari ? 'Safari' : 'Other'})`);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          console.log("⏰ NotificationStatus: Таймаут истек для Safari!");
          reject(new Error("Remove subscription timeout in Safari"));
        }, timeoutMs);
      });
      
      const removePromise = removePushSubscription();
      await Promise.race([removePromise, timeoutPromise]);
      console.log("✅ NotificationStatus: Подписка успешно удалена");
    } catch (error) {
      console.error("❌ NotificationStatus: Ошибка при удалении подписки:", error);
      // В Safari часто бывают таймауты, показываем пользователю
      if (error instanceof Error && error.message.includes("timeout")) {
        console.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально");
        alert("В Safari может потребоваться больше времени для удаления подписки. Попробуйте еще раз через несколько секунд.");
      } else if (error instanceof Error && error.message.includes("SW not available")) {
        console.warn("⚠️ NotificationStatus: Service Worker недоступен в Safari");
        alert("В Safari push-уведомления могут работать нестабильно. Добавьте сайт в главный экран для лучшей работы.");
      }
    }
  };

  // Получаем публичный VAPID ключ и инициализируем push-уведомления при монтировании
  useEffect(() => {
    console.log("🚀 NotificationStatus: useEffect для инициализации запущен");
    let cancelled = false;
    
    (async () => {
      try {
        console.log("🔧 NotificationStatus: Получаем VAPID ключ...");
        const { publicKey } = await getPublicKeyAction();
        if (!cancelled) {
          setVapidKey(publicKey ?? null);
          console.log("✅ NotificationStatus: VAPID ключ установлен:", !!publicKey);
        }
        
        // Устанавливаем userId для push-уведомлений
        if (session?.user?.id) {
          console.log("🔧 NotificationStatus: Устанавливаем userId:", session.user.id);
          setUserId(session.user.id);
          
          // Проверяем серверную подписку только после установки userId
          console.log("🔧 NotificationStatus: Планируем проверку серверной подписки через 100мс");
          setTimeout(() => {
            console.log("🔧 NotificationStatus: Вызываем checkServerSubscription...");
            checkServerSubscription();
          }, 100);
        } else {
          console.warn("⚠️ NotificationStatus: No user ID found in session");
        }
      } catch (e) {
        if (!cancelled) {
          setVapidKey(null);
          console.error("❌ NotificationStatus: Failed to fetch VAPID public key", e);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, setUserId, checkServerSubscription]);

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
          <strong>Разрешение браузера:</strong>
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
