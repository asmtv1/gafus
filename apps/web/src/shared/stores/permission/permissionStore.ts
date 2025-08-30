// Store для управления разрешениями браузера на уведомления

import { create } from "zustand";
import { persist } from "zustand/middleware";

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
        console.log("🚀 requestPermission: Начинаем запрос разрешения на уведомления");
        
        if (!isNotificationSupported()) {
          console.log("❌ requestPermission: Уведомления не поддерживаются");
          set({ error: "Этот браузер не поддерживает уведомления" });
          return "denied";
        }

        console.log("✅ requestPermission: Уведомления поддерживаются, запрашиваем разрешение");
        set({ isLoading: true, error: null });

        try {
          // Простой запрос разрешения без таймаута
          console.log("🔧 requestPermission: Запрашиваем разрешение");
          const result = await Notification.requestPermission();
          console.log("✅ requestPermission: Разрешение получено:", result);
          
          set({
            permission: result,
            isLoading: false,
          });
          return result;
        } catch (error) {
          console.error("❌ requestPermission: Ошибка запроса разрешения уведомлений:", error);
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
