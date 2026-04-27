import type { AnalyticsAdapter } from "./adapter";

type YmMethod =
  | "init"
  | "hit"
  | "reachGoal"
  | "setUserID";

type YmFn = {
  (counterId: number, method: YmMethod, ...args: unknown[]): void;
  a?: unknown[];
  l?: number;
};

declare global {
  interface Window {
    ym?: YmFn;
  }
}

const YM_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";
const YM_SCRIPT_ID = "gafus-ym-script";

let loadingPromise: Promise<void> | null = null;

function toCounterNumber(counterId: string): number | null {
  const n = Number(counterId);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function ensureYmStub(): YmFn {
  const existing = window.ym;
  if (existing) {
    return existing;
  }
  const ym: YmFn = function (...args: unknown[]) {
    const queue = ym.a || [];
    queue.push(args);
    ym.a = queue;
  };
  ym.l = Date.now();
  window.ym = ym;
  return ym;
}

async function ensureYmScriptLoaded(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (document.getElementById(YM_SCRIPT_ID)) {
    return;
  }
  if (loadingPromise) {
    return loadingPromise;
  }
  ensureYmStub();
  loadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = YM_SCRIPT_ID;
    script.async = true;
    script.src = YM_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Не удалось загрузить скрипт Яндекс.Метрики"));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

function getPathFromProperties(properties: Record<string, unknown>): string {
  const gafus = properties.gafus;
  if (typeof gafus === "object" && gafus !== null) {
    const path = (gafus as { pathOrScreen?: unknown }).pathOrScreen;
    if (typeof path === "string" && path.length > 0) {
      return path;
    }
  }
  if (typeof window !== "undefined") {
    return `${window.location.pathname}${window.location.search}`;
  }
  return "/";
}

/**
 * Web-адаптер Яндекс.Метрики: page_view => hit, остальное => reachGoal.
 */
export async function createYandexWebAdapter(counterId: string): Promise<AnalyticsAdapter> {
  const numericCounterId = toCounterNumber(counterId);
  if (!numericCounterId) {
    throw new Error("Некорректный counterId Яндекс.Метрики");
  }

  await ensureYmScriptLoaded();
  const ym = ensureYmStub();
  ym(numericCounterId, "init", {
    clickmap: true,
    trackHash: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });

  return {
    capture: (eventName, properties) => {
      if (eventName === "page_view") {
        ym(numericCounterId, "hit", getPathFromProperties(properties), {
          title: typeof document !== "undefined" ? document.title : "",
          params: properties,
        });
        return;
      }
      ym(numericCounterId, "reachGoal", eventName, properties);
    },
    identify: (userId) => {
      ym(numericCounterId, "setUserID", userId);
    },
    reset: () => {
      /* В API Метрики нет явного reset user. */
    },
  };
}
