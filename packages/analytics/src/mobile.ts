import {
  setAnalyticsAdapter,
  setAnalyticsCaptureEnabled,
  setSessionIdProvider,
} from "./client";
import { createPostHogMobileAdapter } from "./posthog-mobile";

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

/**
 * F8: в dev capture только при devAllowCapture; в prod — при непустом apiKey.
 * anonymousId готовит приложение (AsyncStorage), чтобы не тянуть RN в типах пакета.
 */
export async function initAnalyticsMobile(options: {
  apiKey: string;
  host: string;
  devAllowCapture: boolean;
  anonymousId: string;
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
    console.warn("[analytics] смена mobile POSTHOG key (dev) — пересоздаём");
  }
  if (!mobileInstance) {
    mobileInstance = await createPostHogMobileAdapter(apiKey, options.host);
  }
  lastKey = apiKey;
  setSessionIdProvider(() => options.anonymousId);
  setAnalyticsAdapter(mobileInstance);
  setAnalyticsCaptureEnabled(true);
}
