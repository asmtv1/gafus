// Store для управления UI уведомлений (модальные окна, статус)

import { create } from "zustand";
import { persist } from "zustand/middleware";

const NOTIFICATION_REMIND_DELAY_DAYS = 10;
const NOTIFICATION_REMIND_DELAY_MS = NOTIFICATION_REMIND_DELAY_DAYS * 24 * 60 * 60 * 1000;

const STORAGE_VERSION = "v1";
const KEY_MODAL_SHOWN = `${STORAGE_VERSION}:notificationModalShown`;
const KEY_DISMISSED_UNTIL = `${STORAGE_VERSION}:notificationDismissedUntil`;

function safeGetItem(key: string): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or private mode
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

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
        const dismissedUntil = Date.now() + NOTIFICATION_REMIND_DELAY_MS;
        set({ dismissedUntil });
        safeSetItem(KEY_DISMISSED_UNTIL, dismissedUntil.toString());
      },

      markModalAsShown: () => {
        set({ modalShown: true, dismissedUntil: null });
        safeSetItem(KEY_MODAL_SHOWN, "true");
        safeRemoveItem(KEY_DISMISSED_UNTIL);
      },

      shouldShowModal: (hasPermission: boolean, isSupported: boolean) => {
        const { modalShown, dismissedUntil } = get();

        const modalShownInStorage = safeGetItem(KEY_MODAL_SHOWN) === "true";

        if (modalShown || modalShownInStorage) {
          return false;
        }

        const dismissedUntilFromStorage = safeGetItem(KEY_DISMISSED_UNTIL);

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
          safeRemoveItem(KEY_DISMISSED_UNTIL);
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
