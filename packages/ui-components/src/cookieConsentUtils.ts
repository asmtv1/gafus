// packages/ui-components/src/cookieConsentUtils.ts

export const COOKIE_CONSENT_STORAGE_KEY = "gafus:cookieConsent:v1";

/** CustomEvent при изменении согласия (та же вкладка), см. docs/features/cookie-consent.md */
export const COOKIE_CONSENT_CHANGE_EVENT = "gafus:cookieConsentChange" as const;

export type ConsentValue = "accepted" | "declined";

export function getConsentValue(
  storageKey = COOKIE_CONSENT_STORAGE_KEY
): ConsentValue | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  if (raw === "accepted" || raw === "declined") return raw;
  return null;
}

export function setConsentValue(
  value: ConsentValue,
  storageKey = COOKIE_CONSENT_STORAGE_KEY
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, value);
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: { value } }),
  );
}

export function resetCookieConsent(
  storageKey = COOKIE_CONSENT_STORAGE_KEY
): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey);
  // Уведомляем баннер через custom event — без перезагрузки страницы
  window.dispatchEvent(new CustomEvent("gafus:cookieConsentReset"));
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: { value: null } }),
  );
}
