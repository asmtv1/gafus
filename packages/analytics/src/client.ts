import type {
  AnalyticsPlatform,
  AnalyticsTrackEventInput,
  AnalyticsTrackPayload,
} from "@gafus/types";

import { ANALYTICS_QUEUE_MAX } from "./constants";
import { buildGafusProperties, isCanonicalEventName, safeParseTrackPayload } from "./validate";

import type { AnalyticsAdapter } from "./adapter";

/**
 * Лог в консоль (queued/sent).
 * localStorage `gafus:analyticsDebug=1` — без ограничения по hostname (удобно для LAN / start:all).
 * env NEXT_PUBLIC_GAFUS_ANALYTICS_DEBUG — только dev или localhost/LAN, не боевой домен.
 */
function shouldLogAnalyticsVerbose(): boolean {
  if (analyticsDebugEnabled) {
    return true;
  }

  const isReactNativeDev =
    typeof globalThis !== "undefined" &&
    (globalThis as { __DEV__?: boolean }).__DEV__ === true;
  if (isReactNativeDev) {
    const mobileDebugEnv =
      (typeof process !== "undefined" && process.env.EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG === "1") ||
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GAFUS_ANALYTICS_DEBUG === "1");
    if (mobileDebugEnv) {
      return true;
    }
  }

  if (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    window.localStorage.getItem("gafus:analyticsDebug") === "1"
  ) {
    return true;
  }
  const envOn =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_GAFUS_ANALYTICS_DEBUG === "1";
  if (!envOn) {
    return false;
  }
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  return isLocalHost;
}

if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
  queueMicrotask(() => {
    if (window.localStorage.getItem("gafus:analyticsDebug") === "1") {
      // eslint-disable-next-line no-console -- явная метка, что бандл подхватил флаг (после F5)
      console.log(
        "[gafus:analytics] отладка: gafus:analyticsDebug=1 — жду trackEvent (queued/sent ниже)",
      );
    }
  });
}

if (
  typeof window === "undefined" &&
  typeof globalThis !== "undefined" &&
  (globalThis as { __DEV__?: boolean }).__DEV__ === true &&
  typeof process !== "undefined" &&
  process.env.EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG === "1"
) {
  // eslint-disable-next-line no-console -- явная метка mobile debug-режима
  console.log("[gafus:analytics] mobile debug enabled (EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG=1)");
}

function hasYmCounterInClientBundle(): boolean {
  return Boolean(
    typeof process !== "undefined" &&
      String(process.env.NEXT_PUBLIC_YM_COUNTER_ID ?? "").trim(),
  );
}

/** Почему событие в очереди, а не sent (для отладки). */
function analyticsQueueDebugHint(): Record<string, boolean | string> {
  const hasCounter = hasYmCounterInClientBundle();
  if (!hasCounter) {
    return {
      hasYmCounterInBundle: false,
      hint: "В клиентской сборке пустой NEXT_PUBLIC_YM_COUNTER_ID — syncWebAnalyticsWithConsent noop, ym не грузится.",
    };
  }
  if (!adapter) {
    return {
      hasYmCounterInBundle: true,
      hasAdapter: false,
      hint: "Счётчик задан, но адаптера нет: нажми «Принять» в баннере cookies (localStorage gafus:cookieConsent:v1=accepted) или дождись окончания init.",
    };
  }
  if (!captureEnabled) {
    return {
      hasYmCounterInBundle: true,
      hasAdapter: true,
      captureEnabled: false,
      hint: "Отправка выключена (отклонённые/сброшенные cookies).",
    };
  }
  return { hint: "Ожидалось sent — если видишь только queued, это баг." };
}

function logAnalyticsVerbose(payload: AnalyticsTrackPayload, phase: "queued" | "sent"): void {
  if (!shouldLogAnalyticsVerbose()) {
    return;
  }
  if (phase === "queued") {
    // eslint-disable-next-line no-console -- отладка очереди (F4)
    console.log(`[gafus:analytics] queued`, payload, analyticsQueueDebugHint());
    return;
  }
  // eslint-disable-next-line no-console -- отладка отправки (F4)
  console.log(`[gafus:analytics] sent`, payload);
}

let adapter: AnalyticsAdapter | null = null;
let captureEnabled = false;
let analyticsDebugEnabled = false;
/** F4: идемпотентность init на стороне web/mobile — lastKey в `web.ts` / `mobile.ts`. */
let sessionIdGetter: () => string = () => "unknown";
const eventQueue: AnalyticsTrackPayload[] = [];

function shouldSendNow(): boolean {
  return Boolean(adapter && captureEnabled);
}

function enqueuePayload(payload: AnalyticsTrackPayload): void {
  eventQueue.push(payload);
  logAnalyticsVerbose(payload, "queued");
  while (eventQueue.length > ANALYTICS_QUEUE_MAX) {
    eventQueue.shift();
  }
}

function dispatchCapturePayload(payload: AnalyticsTrackPayload): void {
  if (!adapter) {
    return;
  }
  try {
    const gafus = buildGafusProperties(payload);
    adapter.capture(payload.eventName, { gafus });
    logAnalyticsVerbose(payload, "sent");
  } catch {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- F4, без Tracer
      console.debug("[analytics] capture failed");
    }
  }
}

export function flushQueuedEvents(): void {
  if (!shouldSendNow()) {
    return;
  }
  while (eventQueue.length > 0) {
    const p = eventQueue.shift();
    if (p) {
      dispatchCapturePayload(p);
    }
  }
}

/** F4: сброс очереди при отказе / отзыве согласия (не вызывать до первого accept без инстанса). */
export function clearAnalyticsEventQueue(): void {
  eventQueue.length = 0;
}

function normalizeEventInput(
  input: AnalyticsTrackEventInput,
): Record<string, unknown> {
  const sessionId = input.sessionId ?? sessionIdGetter();
  const ts = input.ts ?? new Date().toISOString();
  return { ...input, sessionId, ts };
}

export function trackEvent(input: AnalyticsTrackEventInput): void {
  try {
    const merged = normalizeEventInput(input);
    if (!isCanonicalEventName(merged.eventName as string)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[analytics] eventName вне allowlist, пропуск", merged.eventName);
      }
      return;
    }
    const parsed = safeParseTrackPayload(merged);
    if (!parsed.ok) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console -- F4
        console.debug("[analytics] Zod/allowlist: payload не принят", merged);
      }
      return;
    }
    const payload = parsed.value;
    if (!shouldSendNow()) {
      enqueuePayload(payload);
      return;
    }
    dispatchCapturePayload(payload);
  } catch {
    /* F4: публичные API не бросают */
  }
}

export function trackScreenView(params: { pathOrScreen: string; platform: AnalyticsPlatform }): void {
  try {
    trackEvent({
      eventName: "page_view",
      pathOrScreen: params.pathOrScreen,
      platform: params.platform,
    });
  } catch {
    /* F4 */
  }
}

export function identifyUser(userId: string): void {
  try {
    if (!adapter || !captureEnabled) {
      return;
    }
    const id = String(userId);
    if (!id) {
      return;
    }
    adapter.identify(id);
  } catch {
    /* F4 */
  }
}

export function resetAnalyticsUser(): void {
  try {
    if (!adapter) {
      return;
    }
    adapter.reset();
  } catch {
    /* F4 */
  }
}

export function isAnalyticsReady(): boolean {
  return shouldSendNow();
}

export function setSessionIdProvider(getter: () => string): void {
  sessionIdGetter = getter;
}

/** @internal — entry web/mobile */
export function setAnalyticsAdapter(next: AnalyticsAdapter | null): void {
  adapter = next;
  if (shouldSendNow()) {
    flushQueuedEvents();
  }
}

/** @internal */
export function setAnalyticsCaptureEnabled(flag: boolean): void {
  captureEnabled = flag;
  if (shouldSendNow()) {
    flushQueuedEvents();
  }
}

/** @internal */
export function setAnalyticsDebugEnabled(flag: boolean): void {
  analyticsDebugEnabled = flag;
  if (flag && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- явный маркер включения debug в RN/web
    console.log("[gafus:analytics] debug enabled via runtime config");
  }
}
