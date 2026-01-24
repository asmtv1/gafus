// Композитный store для управления уведомлениями
// Объединяет функциональность нескольких специализированных stores

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useEffect, useCallback } from "react";
import { createWebLogger } from "@gafus/logger";
import { usePermissionStore } from "../permission/permissionStore";
import { usePushStore } from "../push/pushStore";
import { useNotificationUIStore } from "../ui/notificationUIStore";

const logger = createWebLogger("web");

/**
 * Главный хук для работы с уведомлениями
 * Объединяет функциональность всех специализированных stores
 */
export function useNotificationComposite() {
  const permission = usePermissionStore();
  const push = usePushStore();
  const ui = useNotificationUIStore();

  // Мемоизируем функции для предотвращения бесконечных циклов
  const checkServerSubscription = useCallback(() => {
    return push.checkServerSubscription();
  }, [push.checkServerSubscription]);

  const ensureActiveSubscription = useCallback(() => {
    return push.ensureActiveSubscription();
  }, [push.ensureActiveSubscription]);

  const setUserId = useCallback(
    (userId: string) => {
      return push.setUserId(userId);
    },
    [push.setUserId],
  );

  const requestPermission = useCallback(
    async (vapidPublicKey?: string): Promise<void> => {
      // Проверяем текущее разрешение до запроса
      const permissionBeforeRequest = permission.permission;

      const result = await permission.requestPermission();

      if (result === "granted") {
        ui.markModalAsShown();

        try {
          if (vapidPublicKey) {
            await push.setupPushSubscription(vapidPublicKey);
          } else {
            const { publicKey } = await getPublicKeyAction();
            if (publicKey) {
              await push.setupPushSubscription(publicKey);
            } else {
              const errorMsg = "VAPID key not available for push subscription";
              permission.setError(errorMsg);
              throw new Error(errorMsg);
            }
          }
        } catch (e) {
          logger.error("Failed to setup push subscription:", e as Error, { operation: "error" });
          const errorMsg = e instanceof Error ? e.message : "Ошибка настройки push-подписки";
          permission.setError(errorMsg);
          throw e;
        }
      } else {
        // Если разрешение было denied до запроса, значит оно было заблокировано
        const wasBlockedBefore = permissionBeforeRequest === "denied";
        const errorMsg = wasBlockedBefore
          ? "Разрешение на уведомления заблокировано в настройках браузера"
          : "Пользователь не разрешил уведомления";
        permission.setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [permission, ui.markModalAsShown, push.setupPushSubscription],
  );

  return {
    // Состояние
    permission: permission.permission,
    subscription: push.subscription,
    hasServerSubscription: push.hasServerSubscription,
    showModal: ui.showModal,
    dismissedUntil: ui.dismissedUntil,
    isLoading: permission.isLoading || push.isLoading,
    error: permission.error || push.error,
    disabledByUser: push.disabledByUser,

    // Действия разрешений
    initializePermission: permission.initializePermission,
    requestPermission,

    // Действия push-подписок
    setupPushSubscription: push.setupPushSubscription,
    checkServerSubscription,
    removePushSubscription: push.removePushSubscription,
    ensureActiveSubscription,

    // Действия UI
    dismissModal: ui.dismissModal,
    setShowModal: ui.setShowModal,
    setLoading: (loading: boolean) => {
      permission.setLoading(loading);
      push.setLoading(loading);
    },
    setError: (error: string | null) => {
      permission.setError(error);
      push.setError(error);
    },
    clearError: () => {
      permission.clearError();
      push.setError(null);
    },
    setDisabledByUser: push.setDisabledByUser,
    setUserId,

    // Утилиты
    isSupported: () => permission.isSupported() && push.isSupported(),
    canRequest: permission.canRequest,
    isGranted: permission.isGranted,
    shouldShowModal: useCallback(() => {
      return ui.shouldShowModal(permission.isGranted(), permission.isSupported());
    }, [ui.shouldShowModal, permission.isGranted, permission.isSupported]),

    // Внутренние stores для прямого доступа при необходимости
    stores: {
      permission,
      push,
      ui,
    },
  };
}

/**
 * Hook для автоматической инициализации уведомлений
 */
export function useNotificationInitializer() {
  const {
    initializePermission,
    checkServerSubscription,
    permission: permissionState,
    hasServerSubscription,
    ensureActiveSubscription,
  } = useNotificationComposite();

  // Инициализируем при монтировании (только один раз)
  useEffect(() => {
    initializePermission();
  }, []); // Убираем initializePermission из зависимостей

  // Проверяем серверную подписку при изменении разрешения
  useEffect(() => {
    if (permissionState === "granted") {
      checkServerSubscription();
    }
  }, [permissionState]); // Убираем checkServerSubscription из зависимостей

  // Если разрешение есть, но серверной подписки нет — пытаемся автоматически восстановить
  useEffect(() => {
    if (permissionState === "granted" && hasServerSubscription === false) {
      ensureActiveSubscription();
    }
  }, [permissionState, hasServerSubscription]); // Убираем ensureActiveSubscription из зависимостей

  return { checkServerSubscription };
}

/**
 * Hook для показа модального окна уведомлений
 */
export function useNotificationModal() {
  const { showModal, setShowModal, shouldShowModal, stores } = useNotificationComposite();

  useEffect(() => {
    // Восстанавливаем флаг пользовательского отключения из localStorage на клиенте
    try {
      const stored = localStorage.getItem("notificationsDisabledByUser");
      if (stored === "1") {
        stores.push.setDisabledByUser(true);
      }
    } catch (error) {
      logger.warn("Failed to get localStorage item:", { error, operation: "warn" });
    }
  }, [stores.push]);

  return {
    showModal: showModal || shouldShowModal(),
    setShowModal,
  };
}
