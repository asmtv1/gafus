"use client";

import { createWebLogger } from "@gafus/logger";
import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useNotificationComposite, useNotificationInitializer } from "@shared/stores";
import { showNotificationPermissionAlert, showInstallPWAAlert } from "@shared/utils/sweetAlert";
import { detectPushSupport } from "@shared/utils/detectPushSupport";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";

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
    dismissedUntil,
    shouldShowModal,
    dismissModal,
  } = useNotificationComposite();
  const [mounted, setMounted] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const hasShownDialogRef = useRef(false);

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

  // Обработчики для диалогов
  const handleAllowNotifications = useCallback(async () => {
    // requestPermission сам получит VAPID ключ, если он не передан
    // markModalAsShown() вызывается внутри requestPermission при успешном разрешении
    await requestPermission(vapidKey || undefined);
  }, [vapidKey, requestPermission]);

  const handleDenyNotifications = useCallback(async () => {
    await removePushSubscription();
    dismissModal();
  }, [removePushSubscription, dismissModal]);

  // Сбрасываем флаг, когда dismissedUntil очищается (время прошло) и можно показывать диалог
  useEffect(() => {
    if (dismissedUntil === null && shouldShowModal()) {
      hasShownDialogRef.current = false;
    }
  }, [dismissedUntil, shouldShowModal]);

  // Показываем диалоги (инструкция PWA или запрос разрешений)
  useEffect(() => {
    // Если уже показывали диалог в этой сессии, не показываем снова (предотвращает дубли)
    // Флаг сбрасывается при размонтировании компонента или когда shouldShowModal() меняется
    if (hasShownDialogRef.current) {
      return;
    }

    // Если пользователь не авторизован или компонент не смонтирован, не показываем ничего
    if (status !== "authenticated" || !session?.user || !mounted) {
      return;
    }

    // Если разрешение уже есть, не показываем модальное окно
    if (permission === "granted") {
      return;
    }

    // Если разрешение заблокировано, ничего не показываем
    if (permission === "denied") {
      return;
    }

    // Не показываем диалог, пока VAPID ключ не загрузится
    if (vapidKey === null) {
      return;
    }

    // Определяем платформу и нужные действия
    const pushSupport = detectPushSupport();

    // iOS (не PWA) - показываем инструкцию установки PWA
    // Для iOS не проверяем shouldShowModal, так как инструкция всегда показывается
    if (pushSupport.showInstallPrompt) {
      hasShownDialogRef.current = true;
      showInstallPWAAlert();
      return;
    }

    // iOS (PWA) / Android / Desktop - показываем запрос разрешений
    // shouldShowModal() проверяет dismissedUntil и вернет true, если время прошло
    if (pushSupport.showNotificationPrompt && shouldShowModal() && isSupported()) {
      hasShownDialogRef.current = true;
      showNotificationPermissionAlert(
        handleAllowNotifications,
        handleDenyNotifications,
        isLoading,
        error
      );
      return;
    }

    // Другие случаи - ничего не показываем
  }, [mounted, status, session?.user, permission, dismissedUntil, shouldShowModal, isSupported, isLoading, error, handleAllowNotifications, handleDenyNotifications, vapidKey]);

  // Компонент не рендерит ничего, так как использует SweetAlert2
  return null;
}