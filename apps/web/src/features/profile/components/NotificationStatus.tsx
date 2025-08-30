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
    if (vapidKey) {
      console.log("✅ NotificationStatus: VAPID ключ доступен, запрашиваем разрешение");
ка      
      try {
        // Добавляем таймаут для Safari, чтобы избежать зависания
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("Request permission timeout in Safari"));
          }, 15000); // 15 секунд для Safari
        });
        
        const permissionPromise = requestPermission(vapidKey);
        await Promise.race([permissionPromise, timeoutPromise]);
        console.log("✅ NotificationStatus: Разрешение получено успешно");
      } catch (error) {
        console.error("❌ NotificationStatus: Ошибка при запросе разрешения:", error);
        // В Safari часто бывают таймауты, показываем пользователю
        if (error instanceof Error && error.message.includes("timeout")) {
          console.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально");
        }
      }
    } else {
      console.error("❌ NotificationStatus: VAPID key not available");
    }
  };

  const handleDenyNotifications = async () => {
    console.log("🚀 NotificationStatus: handleDenyNotifications вызван");
    
    try {
      // Добавляем таймаут для Safari, чтобы избежать зависания
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Remove subscription timeout in Safari"));
        }, 15000); // 15 секунд для Safari
      });
      
      const removePromise = removePushSubscription();
      await Promise.race([removePromise, timeoutPromise]);
      console.log("✅ NotificationStatus: Подписка успешно удалена");
    } catch (error) {
      console.error("❌ NotificationStatus: Ошибка при удалении подписки:", error);
      // В Safari часто бывают таймауты, показываем пользователю
      if (error instanceof Error && error.message.includes("timeout")) {
        console.warn("⚠️ NotificationStatus: Таймаут в Safari - это нормально");
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
