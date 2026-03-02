"use client";

import { reportClientError } from "@gafus/error-handling";

interface GlobalErrorConfig {
  appName?: string;
  environment?: string;
  logToConsole?: boolean;
  showErrorDetails?: boolean;
}

const defaultConfig: GlobalErrorConfig = {
  appName: "web-global-handler",
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  logToConsole: true,
  showErrorDetails: process.env.NODE_ENV === "development",
};

export function setupGlobalErrorHandling(config?: Partial<GlobalErrorConfig>) {
  if (typeof window === "undefined") {
    return;
  }

  const mergedConfig = { ...defaultConfig, ...config };

  // Отлов необработанных ошибок JavaScript → Tracer
  window.onerror = (message, source, lineno, colno, error) => {
    if (error) {
      reportClientError(error, {
        issueKey: "GlobalJsError",
        keys: {
          source: String(source),
          lineno: Number(lineno),
          colno: Number(colno),
          message: String(message),
        },
      });
    }
    return false; // Возвращаем false, чтобы браузер продолжил обработку (например, вывод в консоль)
  };

  // Отлов необработанных Promise rejections
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const reasonMessage = reason instanceof Error ? reason.message : String(reason);

    // Проверяем сетевые ошибки и переводим в офлайн
    const isNetworkError =
      reasonMessage.includes("Failed to fetch") ||
      reasonMessage.includes("ERR_INTERNET_DISCONNECTED") ||
      reasonMessage.includes("NetworkError") ||
      reasonMessage.includes("Network request failed") ||
      !navigator.onLine;

    if (isNetworkError && typeof window !== "undefined") {
      // Импортируем store динамически, чтобы избежать циклических зависимостей
      import("@shared/stores/offlineStore")
        .then(({ useOfflineStore }) => {
          const store = useOfflineStore.getState();
          if (store.isOnline) {
            store.setOnlineStatus(false);
          }
          if (store.activeDownloads > 0) {
            return;
          }
          // Немедленный редирект на страницу офлайна
          if (window.location.pathname !== "/~offline") {
            window.location.href = "/~offline";
          }
        })
        .catch(() => {
          // Игнорируем ошибки импорта
        });
    }

    if (reason instanceof Error) {
      reportClientError(reason, {
        issueKey: "UnhandledRejection",
        keys: { isNetworkError },
      });
    } else {
      reportClientError(new Error(`Unhandled rejection: ${reason}`), {
        issueKey: "UnhandledRejection",
        keys: { isNetworkError },
      });
    }
  };

  if (mergedConfig.logToConsole && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("✅ Глобальный отлов ошибок настроен");
  }
}

/**
 * Хук для использования в React компонентах
 */
export function useGlobalErrorHandling() {
  if (typeof window !== "undefined") {
    setupGlobalErrorHandling();
  }
}
