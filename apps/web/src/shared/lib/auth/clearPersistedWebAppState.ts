/**
 * Очистка localStorage от данных приложения после выхода / удаления аккаунта.
 * Согласие на cookies (GAFUS) не трогаем.
 */

const COOKIE_CONSENT_KEY = "gafus:cookieConsent:v1";

/** Имена storage в zustand/persist по проекту. */
const ZUSTAND_PERSIST_KEYS = [
  "course-store",
  "favorites-store",
  "notification-ui-storage",
  "offline-store",
  "permission-storage",
  "pets-store",
  "push-storage",
  "step-storage",
  "training-storage",
  "user-store-v2",
] as const;

/**
 * Удаляет кэш курсов, избранного, офлайна, шагов тренировки и т.д.
 * Вызывать на клиенте после удаления аккаунта или полного выхода.
 */
export function clearPersistedWebAppState(): void {
  if (typeof window === "undefined") return;

  try {
    for (const key of ZUSTAND_PERSIST_KEYS) {
      localStorage.removeItem(key);
    }

    const extraRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === COOKIE_CONSENT_KEY) continue;
      if (
        key.startsWith("v1:notification") ||
        key === "notificationsDisabledByUser" ||
        key.startsWith("step-storage:") ||
        /^training-.*-(end|paused)$/.test(key)
      ) {
        extraRemove.push(key);
      }
    }
    for (const key of extraRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
