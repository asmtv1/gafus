"use client";

import { useOfflineStore } from "@shared/stores/offlineStore";
import { createWebLogger } from "@gafus/logger";

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
  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Игнорируем запросы к странице офлайна и статическим ресурсам
    if (
      url.includes("/~offline") ||
      url.includes("/_next/") ||
      url.includes("/api/ping") ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    ) {
      return originalFetch(input, init);
    }

    // Проверяем navigator.onLine перед запросом
    const store = useOfflineStore.getState();
    if (!navigator.onLine) {
      // Если офлайн, устанавливаем статус и не делаем запрос
      if (store.isOnline) {
        logger.warn("Navigator offline detected before request, setting offline status", { url });
        store.setOnlineStatus(false);
      }
      // Бросаем ошибку, чтобы запрос не выполнился
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

      if (isNetworkError || isNavigatorOffline) {
        const currentStore = useOfflineStore.getState();
        if (currentStore.isOnline) {
          logger.warn("Network error detected, setting offline status", {
            url,
            error: errorMessage,
            navigatorOnLine: navigator.onLine,
          });
          currentStore.setOnlineStatus(false);
          // Редирект обрабатывается в offlineDetector
        }
      }

      throw error;
    }
  };
}

/**
 * Проверяет реальное подключение к серверу
 */
export async function checkRealConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch("/api/ping", {
      method: "HEAD",
      cache: "no-cache",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
