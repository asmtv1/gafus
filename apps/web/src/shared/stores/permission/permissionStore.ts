// Store для управления разрешениями браузера на уведомления

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для permission store
const logger = createWebLogger('web-permission-store');

interface PermissionState {
  permission: NotificationPermission | null;
  isLoading: boolean;
  error: string | null;

  // Действия
  initializePermission: () => void;
  requestPermission: () => Promise<NotificationPermission>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Утилиты
  isSupported: () => boolean;
  canRequest: () => boolean;
  isGranted: () => boolean;
}

const isNotificationSupported = () => {
  return typeof Notification !== "undefined";
};

export const usePermissionStore = create<PermissionState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      permission: null,
      isLoading: false,
      error: null,

      // Действия
      initializePermission: () => {
        if (isNotificationSupported()) {
          const currentPermission = Notification.permission;
          set({ permission: currentPermission });
        } else {
          set({ permission: "default" });
        }
      },

      requestPermission: async () => {
        logger.info("🚀 requestPermission: Начинаем запрос разрешения на уведомления", {
          operation: 'start_permission_request'
        });
        
        if (!isNotificationSupported()) {
          logger.warn("❌ requestPermission: Уведомления не поддерживаются", {
            operation: 'notifications_not_supported'
          });
          set({ error: "Этот браузер не поддерживает уведомления" });
          return "denied";
        }

        const currentPermission = Notification.permission;
        
        // Если разрешение уже заблокировано, не вызываем API и сразу возвращаем denied
        if (currentPermission === "denied") {
          const errorMsg = "Разрешение на уведомления заблокировано в настройках браузера";
          logger.warn("⚠️ requestPermission: Разрешение уже заблокировано", {
            operation: 'permission_already_denied'
          });
          set({
            permission: "denied",
            error: errorMsg,
            isLoading: false,
          });
          return "denied";
        }
        
        logger.info("✅ requestPermission: Уведомления поддерживаются, запрашиваем разрешение", {
          operation: 'notifications_supported'
        });
        set({ isLoading: true, error: null });

        try {
          logger.info("🔧 requestPermission: Запрашиваем разрешение", {
            operation: 'request_permission'
          });
          const result = await Notification.requestPermission();
          logger.success("✅ requestPermission: Разрешение получено", {
            operation: 'permission_granted',
            result: result
          });
          
          set({
            permission: result,
            isLoading: false,
          });
          return result;
        } catch (error) {
          logger.error("❌ requestPermission: Ошибка запроса разрешения уведомлений", error as Error, {
            operation: 'permission_request_failed'
          });
          set({
            error: "Не удалось запросить разрешение",
            isLoading: false,
          });
          return "denied";
        }
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      // Утилиты
      isSupported: () => {
        return isNotificationSupported();
      },

      canRequest: () => {
        const { permission } = get();
        return isNotificationSupported() && permission !== "denied";
      },

      isGranted: () => {
        const { permission } = get();
        return permission === "granted";
      },
    }),
    {
      name: "permission-storage",
      partialize: (state) => ({
        permission: state.permission,
      }),
    },
  ),
);
