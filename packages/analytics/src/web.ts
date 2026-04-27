import {
  clearAnalyticsEventQueue,
  resetAnalyticsUser,
  setAnalyticsAdapter,
  setAnalyticsCaptureEnabled,
  setSessionIdProvider,
} from "./client";
import { createYandexWebAdapter } from "./yandex-web";

import type { AnalyticsAdapter } from "./adapter";

const WEB_ANON_KEY = "gafus:analytics:anonymousId";

/** Псевдоним публичного API (план): синхронизация init с согласием на cookies. */
export { syncWebAnalyticsWithConsent as initAnalyticsWeb };

let webInstance: AnalyticsAdapter | null = null;
let lastWebCounterId = "";

/**
 * Стабильный anonymous id в localStorage (веб), до identify.
 */
export function getOrCreateWebAnonymousId(): string {
  if (typeof window === "undefined") {
    return "ssr";
  }
  let id = localStorage.getItem(WEB_ANON_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(WEB_ANON_KEY, id);
  }
  return id;
}

/**
 * Синхронизация web-аналитики с согласием на cookies. Без counterId — тихий no-op (F7).
 */
export async function syncWebAnalyticsWithConsent(
  consent: "accepted" | "declined" | null,
  config: { counterId: string },
): Promise<void> {
  const counterId = config.counterId?.trim() ?? "";
  if (!counterId) {
    return;
  }
  if (lastWebCounterId && lastWebCounterId !== counterId) {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    webInstance = null;
    // eslint-disable-next-line no-console -- F4
    console.warn("[analytics] смена YM counterId (dev) — пересоздаём клиент");
  }

  if (consent === "accepted") {
    if (!webInstance) {
      webInstance = await createYandexWebAdapter(counterId);
    }
    lastWebCounterId = counterId;
    setSessionIdProvider(getOrCreateWebAnonymousId);
    setAnalyticsAdapter(webInstance);
    webInstance.optInCapturing?.();
    setAnalyticsCaptureEnabled(true);
    return;
  }

  /* Отклонение или сброс после accept: не отправляем накопленное; первый визит (null, без inst.) — очередь ждёт accept. */
  if (consent === "declined" || (consent === null && webInstance)) {
    clearAnalyticsEventQueue();
  }
  webInstance?.optOutCapturing?.();
  resetAnalyticsUser();
  setAnalyticsCaptureEnabled(false);
}
