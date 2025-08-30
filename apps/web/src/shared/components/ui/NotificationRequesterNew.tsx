"use client";

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import {
  useNotificationComposite,
  useNotificationInitializer,
  useNotificationModal,
} from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import styles from "./NotificationRequester.module.css";

export default function NotificationRequesterNew() {
  const { data: session, status } = useSession();
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  const {
    permission,
    isLoading,
    error,
    requestPermission,
    dismissModal,
    isSupported,
    checkServerSubscription,
    setUserId,
  } = useNotificationComposite();

  const [mounted, setMounted] = useState(false);

  // Инициализируем уведомления
  useNotificationInitializer();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Управляем модальным окном
  const { showModal } = useNotificationModal();

  // Получаем VAPID ключ и статус подписки при монтировании
  useEffect(() => {
    const initializeData = async () => {
      try {
        const vapidData = await getPublicKeyAction();
        setVapidKey(vapidData.publicKey);
        
        // Устанавливаем userId для push-уведомлений
        console.log("Session user:", session?.user);
        console.log("Session user ID:", session?.user?.id);
        
        if (session?.user?.id) {
          setUserId(session.user.id);
          console.log("Set userId in push store:", session.user.id);
          
          // Проверяем серверную подписку только после установки userId
          setTimeout(() => {
            checkServerSubscription();
          }, 100);
        } else {
          console.warn("No user ID found in session");
        }
      } catch (error) {
        console.error("NotificationRequesterNew initialization error:", error);
      }
    };

    if (mounted) {
      initializeData();
    }
  }, [mounted, checkServerSubscription, setUserId, session?.user?.id]);

  const handleAllowNotifications = async () => {
    console.log("🚀 NotificationRequesterNew: handleAllowNotifications вызван");
    if (vapidKey) {
      console.log("✅ NotificationRequesterNew: VAPID ключ доступен, запрашиваем разрешение");
      await requestPermission(vapidKey);
    } else {
      console.error("❌ NotificationRequesterNew: VAPID key not available");
    }
  };

  const handleDismiss = () => {
    dismissModal();
  };

  // Если пользователь не авторизован, не показываем ничего
  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  // Если уведомления не поддерживаются, не показываем ничего
  if (mounted && !isSupported()) {
    return null;
  }

  // Если уведомления уже разрешены, не показываем ничего
  if (mounted && permission === "granted") {
    return null;
  }

  // Если разрешение было отклонено, показываем модальное окно снова
  if (mounted && permission === "denied") {
    // Очищаем localStorage чтобы показать модальное окно снова
    if (typeof window !== "undefined") {
      localStorage.removeItem("notificationModalShown");
    }
  }

  // Показываем модальное окно если:
  // 1. Пользователь авторизован
  // 2. Уведомления поддерживаются
  // 3. Разрешение не получено (null, default, denied)
  // 4. Модальное окно еще не показывалось в этой сессии
  const shouldShowModal =
    mounted &&
    status === "authenticated" &&
    session?.user &&
    isSupported() &&
    (permission === null || permission === "default" || permission === "denied") &&
    !localStorage.getItem("notificationModalShown");

  // Показываем модальное окно если showModal === true ИЛИ если shouldShowModal === true
  const displayModal = showModal || shouldShowModal;

  if (!displayModal) {
    return null;
  }

  // Не показываем ничего до монтирования
  if (!mounted) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.content}>
          <h3 className={styles.title}>Пожалуйста, разрешите уведомления</h3>
          <p className={styles.message}>
            Это очень важно для получения уведомлений о новых курсах и обновлениях.
          </p>

          {error && (
            <div
              style={{
                color: "red",
                fontSize: "14px",
                marginBottom: "10px",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <div className={styles.buttons}>
            <button
              onClick={handleAllowNotifications}
              disabled={isLoading}
              className={styles.allowButton}
            >
              {isLoading ? "Загрузка..." : "Разрешить"}
            </button>
            <button onClick={handleDismiss} disabled={isLoading} className={styles.dismissButton}>
              Позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
