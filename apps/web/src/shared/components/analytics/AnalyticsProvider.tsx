"use client";

import { syncWebAnalyticsWithConsent } from "@gafus/analytics";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  getConsentValue,
} from "@gafus/ui-components";
import { Suspense, useEffect } from "react";

import { ANALYTICS_ENGINE_READY_EVENT } from "./analytics-internal-events";
import NavigationAnalytics from "./NavigationAnalytics";

type ConsentDetail = { value?: "accepted" | "declined" | null } | null;

/**
 * Init Яндекс.Метрики после согласия; без next-auth. Слушает gafus:cookieConsentChange (F2).
 * После sync диспатчим @internal `gafus:analyticsEngineReady` для identify при уже accepted.
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const pushReady = () => {
      if (typeof window === "undefined") {
        return;
      }
      window.dispatchEvent(new Event(ANALYTICS_ENGINE_READY_EVENT));
    };

    const runSync = async (consent: "accepted" | "declined" | null) => {
      const counterId = process.env.NEXT_PUBLIC_YM_COUNTER_ID ?? "";
      await syncWebAnalyticsWithConsent(consent, { counterId });
      pushReady();
    };

    void runSync(getConsentValue() ?? null);

    const onCustomConsent = (e: Event) => {
      const ce = e as CustomEvent<ConsentDetail>;
      const v = ce.detail?.value;
      if (v === "accepted" || v === "declined") {
        void runSync(v);
        return;
      }
      if (v === null) {
        void runSync(null);
        return;
      }
      void runSync(getConsentValue() ?? null);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== COOKIE_CONSENT_STORAGE_KEY) {
        return;
      }
      void runSync(getConsentValue() ?? null);
    };

    const onReset = () => {
      void runSync(getConsentValue() ?? null);
    };

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onCustomConsent);
    window.addEventListener("storage", onStorage);
    window.addEventListener("gafus:cookieConsentReset", onReset);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onCustomConsent);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gafus:cookieConsentReset", onReset);
    };
  }, []);

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <NavigationAnalytics />
      </Suspense>
    </>
  );
}
