"use client";

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationStore } from "@shared/stores";
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
  } = useNotificationStore();
  const [mounted, setMounted] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Инициализируем уведомления
  // useNotificationInitializer(); // This line is removed as per the edit hint.

  const handleAllowNotifications = async () => {
    if (vapidKey) {
      await requestPermission(vapidKey);
    } else {
      console.error("VAPID key not available");
    }
  };

  const handleDenyNotifications = async () => {
    await removePushSubscription();
  };

  // Получаем публичный VAPID ключ при монтировании
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { publicKey } = await getPublicKeyAction();
        if (!cancelled) setVapidKey(publicKey ?? null);
      } catch (e) {
        if (!cancelled) setVapidKey(null);
        console.error("Failed to fetch VAPID public key", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
