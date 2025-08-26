// Композитный store для управления уведомлениями
// Объединяет функциональность нескольких специализированных stores

import { getPublicKeyAction } from "@shared/lib/actions/publicKey";
import { useEffect } from "react";
import { usePermissionStore } from "../permission/permissionStore";
import { usePushStore } from "../push/pushStore";
import { useNotificationUIStore } from "../ui/notificationUIStore";

/**
 * Главный хук для работы с уведомлениями
 * Объединяет функциональность всех специализированных stores
 */
export function useNotificationComposite() {
  const permission = usePermissionStore();
  const push = usePushStore();
  const ui = useNotificationUIStore();

  return {
    // Состояние
    permission: permission.permission,
    subscription: push.subscription,
    hasServerSubscription: push.hasServerSubscription,
    showModal: ui.showModal,
    isLoading: permission.isLoading || push.isLoading,
    error: permission.error || push.error,
    disabledByUser: push.disabledByUser,

    // Действия разрешений
    initializePermission: permission.initializePermission,
    requestPermission: async (vapidPublicKey?: string) => {
      const result = await permission.requestPermission();

      if (result === "granted") {
        ui.markModalAsShown();

        if (vapidPublicKey) {
          await push.setupPushSubscription(vapidPublicKey);
        } else {
          try {
            const { publicKey } = await getPublicKeyAction();
            if (publicKey) {
              await push.setupPushSubscription(publicKey);
            } else {
              permission.setError("VAPID key not available for push subscription");
            }
          } catch (e) {
            console.error("Failed to get VAPID key:", e);
            permission.setError("VAPID key not available for push subscription");
          }
        }
      } else {
        permission.setError("Пользователь не разрешил уведомления");
      }
    },

    // Действия push-подписок
    setupPushSubscription: push.setupPushSubscription,
    checkServerSubscription: push.checkServerSubscription,
    removePushSubscription: push.removePushSubscription,
    ensureActiveSubscription: push.ensureActiveSubscription,

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
    setUserId: push.setUserId,

    // Утилиты
    isSupported: () => permission.isSupported() && push.isSupported(),
    canRequest: permission.canRequest,
    isGranted: permission.isGranted,
    shouldShowModal: () => ui.shouldShowModal(permission.isGranted(), permission.isSupported()),

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

  // Инициализируем при монтировании
  useEffect(() => {
    initializePermission();
  }, [initializePermission]);

  // Проверяем серверную подписку при изменении разрешения
  useEffect(() => {
    if (permissionState === "granted") {
      checkServerSubscription();
    }
  }, [permissionState, checkServerSubscription]);

  // Если разрешение есть, но серверной подписки нет — пытаемся автоматически восстановить
  useEffect(() => {
    if (permissionState === "granted" && hasServerSubscription === false) {
      ensureActiveSubscription();
    }
  }, [permissionState, hasServerSubscription, ensureActiveSubscription]);

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
      console.warn("Failed to get localStorage item:", error);
    }
  }, [stores.push]);

  return {
    showModal: showModal || shouldShowModal(),
    setShowModal,
  };
}
