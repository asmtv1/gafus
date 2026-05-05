import {
  clearAnalyticsEventQueue,
  setAnalyticsAdapter,
  setAnalyticsCaptureEnabled,
  setAnalyticsDebugEnabled,
  setSessionIdProvider,
} from "./client";
import { createAppMetricaMobileAdapter } from "./appmetrica-mobile";

import type { AnalyticsAdapter } from "./adapter";

/** Публичный API mobile-entry (F5): трекинг идёт из client, init — ниже. */
export {
  flushQueuedEvents,
  identifyUser,
  isAnalyticsReady,
  resetAnalyticsUser,
  trackEvent,
  trackScreenView,
} from "./client";
export { sanitizePath } from "./sanitize-path";

let mobileInstance: AnalyticsAdapter | null = null;
let lastKey = "";

function isDevBundle(): boolean {
  return Boolean(
    (globalThis as { __DEV__?: boolean }).__DEV__,
  );
}

function disableMobileAnalytics(
  options: {
    anonymousId: string;
    debugEnabled?: boolean;
  },
  error: unknown,
): void {
  mobileInstance = null;
  lastKey = "";
  setAnalyticsDebugEnabled(options.debugEnabled === true);
  setSessionIdProvider(() => options.anonymousId);
  setAnalyticsAdapter(null);
  setAnalyticsCaptureEnabled(false);
  clearAnalyticsEventQueue();
  if (isDevBundle() || process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- mobile dev diagnostics when native module is unavailable
    console.warn("[analytics] AppMetrica недоступна, mobile analytics отключена", error);
  }
}

/**
 * Mobile (RN): Яндекс AppMetrica.
 * В dev capture только при devAllowCapture; в prod — при непустом apiKey.
 * anonymousId готовит приложение (AsyncStorage), чтобы не тянуть RN в типах пакета.
 */
export async function initAnalyticsMobile(options: {
  apiKey: string;
  devAllowCapture: boolean;
  anonymousId: string;
  debugEnabled?: boolean;
}): Promise<void> {
  const apiKey = options.apiKey?.trim() ?? "";
  if (!apiKey) {
    return;
  }
  if (isDevBundle() && !options.devAllowCapture) {
    return;
  }
  if (lastKey && lastKey !== apiKey) {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    mobileInstance = null;
    // eslint-disable-next-line no-console -- F4
    console.warn("[analytics] смена mobile AppMetrica key (dev) — пересоздаём");
  }
  if (!mobileInstance) {
    try {
      mobileInstance = await createAppMetricaMobileAdapter(apiKey);
    } catch (error) {
      disableMobileAnalytics(options, error);
      return;
    }
  }
  lastKey = apiKey;
  setAnalyticsDebugEnabled(options.debugEnabled === true);
  setSessionIdProvider(() => options.anonymousId);
  setAnalyticsAdapter(mobileInstance);
  setAnalyticsCaptureEnabled(true);
}
