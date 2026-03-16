"use client";

import { CookieConsentBanner } from "@gafus/ui-components";
import { CSRFProvider } from "@gafus/csrf";
import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

import styles from "./ClientLayout.module.css";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Страница курса: гайд имеет свой оверлей, обычный курс стримится с сервера — без глобального спиннера
    const isCourseMainPage = /^\/trainings\/[^/]+$/.test(pathname ?? "");
    if (isCourseMainPage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    setupGlobalErrorHandling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- однажды при монтировании

  return (
    <CSRFProvider>
      <div className={styles.container}>
        {loading && (
          <div
            className={styles.overlay}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Загрузка"
          >
            <div className={styles.spinner} aria-hidden="true" />
          </div>
        )}

        {children}
        <CookieConsentBanner
          cookiePolicyUrl={
            process.env.NEXT_PUBLIC_COOKIES_URL ?? "/cookies.html"
          }
        />
      </div>
    </CSRFProvider>
  );
}
