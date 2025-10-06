"use client";

import { createWebLogger } from "@gafus/logger";
import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationComposite, useNotificationInitializer } from "@shared/stores";
import { showNotificationPermissionAlert } from "@shared/utils/sweetAlert";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

// Создаем логгер для notification-requester-new
const logger = createWebLogger('web-notification-requester-new');

export default function NotificationRequesterNew() {
  const { data: session, status } = useSession();
  const {
    permission,
    isLoading,
    error,
    requestPermission,
    removePushSubscription,
    isSupported,
    checkServerSubscription,
    setUserId,
    shouldShowModal,
    dismissModal,
  } = useNotificationComposite();
  const [mounted, setMounted] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Инициализируем уведомления
  useNotificationInitializer();

  useEffect(() => {
    setMounted(true);
  }, []);

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
          logger.warn("⚠️ NotificationRequesterNew: No user ID found in session", { 
            operation: 'warn',
            status,
            hasSession: !!session,
            hasUserId: !!session?.user?.id
          });
        }
      } catch (e) {
        if (!cancelled) {
          setVapidKey(null);
          logger.error("❌ NotificationRequesterNew: Failed to fetch VAPID public key", e as Error, { operation: 'error' });
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, setUserId, checkServerSubscription]);

  // Показываем SweetAlert2 модальное окно
  useEffect(() => {
    // Если пользователь не авторизован или уведомления не поддерживаются, не показываем ничего
    if (status !== "authenticated" || !session?.user || !mounted || !isSupported()) {
      return;
    }

    // Если разрешение уже есть, не показываем модальное окно
    if (permission === "granted") {
      return;
    }

    // Если не нужно показывать модальное окно, не показываем ничего
    if (!shouldShowModal()) {
      return;
    }

    const handleAllowNotifications = async () => {
      if (vapidKey) {
        await requestPermission(vapidKey);
        dismissModal();
      } else {
        logger.error("❌ NotificationRequesterNew: VAPID key not available");
      }
    };

    const handleDenyNotifications = async () => {
      await removePushSubscription();
      dismissModal();
    };

    // Показываем SweetAlert2 модальное окно
    showNotificationPermissionAlert(
      handleAllowNotifications, handleDenyNotifications,
      isLoading,
      error
    );
  }, [status, session, mounted, isSupported, permission, shouldShowModal, isLoading, error, vapidKey, requestPermission, dismissModal, removePushSubscription]);

  // Компонент не рендерит ничего, так как использует SweetAlert2
  return null;
}