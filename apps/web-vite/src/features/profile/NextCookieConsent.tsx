import { useEffect, useId, useRef, useState } from "react";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  getConsentValue,
  setConsentValue,
  type ConsentValue,
} from "@gafus/ui-components/cookie-consent";
import styles from "./NextCookieConsent.module.css";
import { SecondaryButton } from "../../shared/ui";
import { useRoutePath } from "../../shared/router/location";

/** Equivalent to retained Next CookieConsentBanner without pulling MUI into Vite.
 * The persisted key, accepted/declined contract and reset events remain shared
 * with the original client so a returning user is never silently opted in. */
export function NextCookieConsent() {
  const route = useRoutePath();
  const authPage = route === "/login" || route === "/register" ||
    route === "/passwordReset" || route === "/reset-password";
  const [visible, setVisible] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const accept = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const sync = () => {
      try {
        setVisible(getConsentValue() === null);
        setStorageError(false);
      } catch {
        // Browser privacy settings can deny localStorage. Consent must not be
        // presumed from a failed read; never dismiss as accepted by default.
        setStorageError(true);
        setVisible(true);
      }
    };
    sync();
    const reset = () => { setVisible(true); setStorageError(false); };
    const consentChanged = () => sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("gafus:cookieConsentReset", reset);
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, consentChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("gafus:cookieConsentReset", reset);
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, consentChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if (visible && !authPage) accept.current?.focus();
  }, [visible, authPage]);
  const choose = (value: ConsentValue) => {
    try {
      setConsentValue(value);
      // Check durable storage rather than treating a click as successful
      // consent. This also surfaces blocked storage without a fake success.
      if (getConsentValue() !== value) throw Error("COOKIE_CONSENT_NOT_PERSISTED");
      setVisible(false);
      setStorageError(false);
    } catch {
      setStorageError(true);
      setVisible(true);
    }
  };
  // The original Next standalone auth routes have no cookie banner.
  // Preserve pending consent until the visitor reaches a non-auth route.
  if (!visible || authPage) return null;
  return <section role="dialog" aria-modal="false"
    aria-labelledby={titleId} aria-describedby={descriptionId}
    className={styles.banner} data-next-cookie-consent>
    <div className={styles.content}>
      <h2 id={titleId} className={styles.title}>Использование cookies</h2>
      <p id={descriptionId} className={styles.description}>
        Мы используем cookies для улучшения работы сайта и персонализации контента.
        {" "}<a href="/cookies.html" target="_blank" rel="noopener noreferrer">
          Подробнее
        </a>
      </p>
      {storageError && <p role="alert" className={styles.error}>
        Браузер не разрешил сохранить выбор. Проверьте настройки хранения данных.
      </p>}
    </div>
    <div className={styles.actions}>
      <button ref={accept} type="button" className={styles.accept}
        onClick={() => choose("accepted")}>Принять</button>
      <SecondaryButton variant="red" type="button" className={styles.decline}
        onClick={() => choose("declined")}>Отклонить</SecondaryButton>
    </div>
  </section>;
}
