// Store для управления UI уведомлений (модальные окна, статус)

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Константа для периода отложения напоминания (10 дней)
const NOTIFICATION_REMIND_DELAY_DAYS = 10;
const NOTIFICATION_REMIND_DELAY_MS = NOTIFICATION_REMIND_DELAY_DAYS * 24 * 60 * 60 * 1000;

interface NotificationUIState {
  showModal: boolean;
  modalShown: boolean; // true = разрешение дано (не показывать больше)
  dismissedUntil: number | null; // timestamp до которого отложен показ

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
      dismissedUntil: null,

      // Действия
      setShowModal: (show) => {
        set({ showModal: show });
      },

      dismissModal: () => {
        set({ showModal: false });
        // Откладываем показ на 10 дней (в миллисекундах)
        const dismissedUntil = Date.now() + NOTIFICATION_REMIND_DELAY_MS;
        set({ dismissedUntil });

        if (typeof window !== "undefined") {
          localStorage.setItem("notificationDismissedUntil", dismissedUntil.toString());
        }
      },

      markModalAsShown: () => {
        set({ modalShown: true, dismissedUntil: null });
        if (typeof window !== "undefined") {
          localStorage.setItem("notificationModalShown", "true");
          localStorage.removeItem("notificationDismissedUntil");
        }
      },

      shouldShowModal: (hasPermission: boolean, isSupported: boolean) => {
        const { modalShown, dismissedUntil } = get();

        // Если разрешение уже дано - не показываем
        const modalShownInStorage =
          typeof window !== "undefined"
            ? localStorage.getItem("notificationModalShown") === "true"
            : false;

        if (modalShown || modalShownInStorage) {
          return false;
        }

        // Проверяем, не отложен ли показ
        const dismissedUntilFromStorage =
          typeof window !== "undefined" ? localStorage.getItem("notificationDismissedUntil") : null;

        const effectiveDismissedUntil =
          dismissedUntil ||
          (dismissedUntilFromStorage ? parseInt(dismissedUntilFromStorage, 10) : null);

        // Если отложен и время еще не прошло - не показываем
        if (effectiveDismissedUntil && Date.now() < effectiveDismissedUntil) {
          return false;
        }

        // Если время прошло - очищаем dismissedUntil
        if (effectiveDismissedUntil && Date.now() >= effectiveDismissedUntil) {
          set({ dismissedUntil: null });
          if (typeof window !== "undefined") {
            localStorage.removeItem("notificationDismissedUntil");
          }
        }

        return isSupported && !hasPermission;
      },
    }),
    {
      name: "notification-ui-storage",
      partialize: (state) => ({
        modalShown: state.modalShown,
        dismissedUntil: state.dismissedUntil,
      }),
    },
  ),
);
