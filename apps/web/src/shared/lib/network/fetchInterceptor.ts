"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { isInOfflineGracePeriod } from "./offlineDetector";

/** Извлекает pathname из URL без query (безопасность: не передаём токены/секреты) */
function extractUrlPath(u: string): string {
  /* eslint-disable @gafus/require-client-catch-tracer -- невалидный URL → fallback path */
  try {
    return new URL(u, "https://x").pathname;
  } catch {
    return u.slice(0, 50);
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

const logger = createWebLogger("web-fetch-interceptor");

/**
 * Глобальный перехватчик fetch для определения сетевых ошибок
 * Обновляет статус офлайна в store при сетевых ошибках
 * Редирект на страницу офлайна обрабатывается в offlineDetector
 */
export function setupFetchInterceptor() {
  if (typeof window === "undefined") {
    return;
  }

  // Сохраняем оригинальный fetch
  const originalFetch = window.fetch;

  // Переопределяем fetch
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const requestHeaders = input instanceof Request ? input.headers : new Headers(init?.headers);
    const shouldIgnoreOffline = requestHeaders.get("X-Gafus-Background-Download") === "1";

    const isMediaRequest =
      url.includes("/uploads/") ||
      url.includes("gafus-media.storage.yandexcloud.net") ||
      url.includes("storage.yandexcloud.net/gafus-media");

    // Игнорируем запросы к странице офлайна, статическим ресурсам и Service Worker URLs
    if (
      url.includes("/~offline") ||
      url.includes("/_next/") ||
      url.includes("/api/ping") ||
      url.startsWith("/offline-hls/") || // Service Worker URLs для офлайн HLS
      url.startsWith("data:") ||
      url.startsWith("blob:")
    ) {
      return originalFetch(input, init);
    }

    // Проверяем, является ли это Server Action запросом
    const isServerAction =
      init?.method === "POST" &&
      (requestHeaders.get("next-action") || requestHeaders.get("x-nextjs-data"));

    // Для Server Actions не применяем offline проверки (они имеют свою логику)
    if (isServerAction && shouldIgnoreOffline) {
      return originalFetch(input, init);
    }

    // Проверяем локальный offline-статус перед запросом
    const store = useOfflineStore.getState();
    if (!store.isOnline && !shouldIgnoreOffline && !isMediaRequest) {
      // Если считаем себя офлайн, блокируем сетевой запрос
      throw new TypeError("Failed to fetch: OFFLINE_MODE");
    }

    // Проверяем navigator.onLine перед запросом (grace period — не блокируем при кратких просадках)
    if (!navigator.onLine && !shouldIgnoreOffline && !isInOfflineGracePeriod()) {
      if (store.isOnline) {
        logger.warn("Navigator offline detected before request, setting offline status", { url });
        store.setOnlineStatus(false);
      }
      throw new TypeError("Failed to fetch: ERR_INTERNET_DISCONNECTED");
    }

    try {
      const response = await originalFetch(input, init);

      // Если запрос успешен, обновляем статус на онлайн
      if (response.ok) {
        if (!store.isOnline) {
          logger.info("Network restored, setting online status", { url });
          store.setOnlineStatus(true);
        }
      } else if (response.status === 404 && isServerAction) {
        // 404 для Server Action может быть признаком старого кеша билда
        logger.warn("Server Action not found (404) - возможно устаревший билд", {
          url,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        });
      }

      return response;
    } catch (error) {
      // Определяем сетевые ошибки
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkError =
        error instanceof TypeError &&
        (errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("Network request failed") ||
          errorMessage.includes("Load failed") ||
          errorMessage.includes("ERR_INTERNET_DISCONNECTED") ||
          errorMessage.includes("ERR_NETWORK_CHANGED") ||
          errorMessage.includes("ERR_CONNECTION_REFUSED") ||
          errorMessage.includes("ERR_CONNECTION_RESET") ||
          errorMessage.includes("ERR_CONNECTION_CLOSED") ||
          errorMessage.includes("ERR_CONNECTION_ABORTED") ||
          errorMessage.includes("ERR_NAME_NOT_RESOLVED"));

      // Проверяем navigator.onLine еще раз после ошибки
      const isNavigatorOffline = !navigator.onLine;

      // Проверяем, является ли запрос same-origin (только для таких ставим offline)
      let isSameOrigin = false;
      /* eslint-disable @gafus/require-client-catch-tracer -- парсинг URL: fallback для относительных путей */
      try {
        const requestUrl = new URL(url, window.location.origin);
        isSameOrigin = requestUrl.origin === window.location.origin;
      } catch {
        // Если не удалось распарсить URL, считаем same-origin (для относительных путей)
        isSameOrigin = !url.startsWith("http://") && !url.startsWith("https://");
      }
      /* eslint-enable @gafus/require-client-catch-tracer */

      if (
        (isNetworkError || isNavigatorOffline) &&
        !shouldIgnoreOffline &&
        !isMediaRequest &&
        isSameOrigin
      ) {
        const currentStore = useOfflineStore.getState();
        if (currentStore.isOnline) {
          logger.warn("Network error detected, setting offline status", {
            url,
            error: errorMessage,
            navigatorOnLine: navigator.onLine,
            isSameOrigin,
          });
          currentStore.setOnlineStatus(false);
          // Редирект обрабатывается в offlineDetector
        }
      }

      // Репортим только неожиданные (не-сетевые) ошибки — рутинный offline не трогаем
      if (!isNetworkError && !isNavigatorOffline) {
        reportClientError(error, {
          severity: "error",
          issueKey: "fetchInterceptor",
          keys: { operation: "fetch_unexpected", urlPath: extractUrlPath(url) },
        });
      }

      throw error;
    }
  };
}
