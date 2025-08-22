// Store для управления UI уведомлений (модальные окна, статус)

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NotificationUIState {
  showModal: boolean;
  modalShown: boolean; // Показывалось ли модальное окно в этой сессии

  // Действия
  setShowModal: (show: boolean) => void;
  dismissModal: () => void;
  markModalAsShown: () => void;
  shouldShowModal: (hasPermission: boolean, isSupported: boolean) => boolean;
}

export const useNotificationUIStore = create<NotificationUIState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      showModal: false,
      modalShown: false,

      // Действия
      setShowModal: (show) => {
        set({ showModal: show });
      },

      dismissModal: () => {
        set({ showModal: false });
        get().markModalAsShown();
      },

      markModalAsShown: () => {
        set({ modalShown: true });
        if (typeof window !== "undefined") {
          localStorage.setItem("notificationModalShown", "true");
        }
      },

      shouldShowModal: (hasPermission: boolean, isSupported: boolean) => {
        const { modalShown } = get();

        // Проверяем localStorage для сохранения между сессиями (только на клиенте)
        const modalShownInStorage =
          typeof window !== "undefined"
            ? localStorage.getItem("notificationModalShown") === "true"
            : false;

        return isSupported && !hasPermission && !modalShown && !modalShownInStorage;
      },
    }),
    {
      name: "notification-ui-storage",
      partialize: (state) => ({
        modalShown: state.modalShown,
      }),
    },
  ),
);
