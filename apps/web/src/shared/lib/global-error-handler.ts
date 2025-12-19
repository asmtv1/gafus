"use client";

import { createWebLogger, type LogMeta } from "@gafus/logger";

// Создаем логгер для глобальных ошибок
const logger = createWebLogger('web-global-error-handler');

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

  // Отлов необработанных ошибок JavaScript
  window.onerror = (message, source, lineno, colno, error) => {
    if (error) {
      const meta: LogMeta = {
        operation: 'global_js_error',
        componentStack: `Global (window.onerror) - ${source}:${lineno}:${colno}`,
        errorBoundaryName: "GlobalErrorHandler",
        url: window.location.href,
        userAgent: navigator.userAgent,
        source: source,
        lineno: lineno,
        colno: colno,
        message: String(message),
        tags: ['global-error', 'window-onerror'],
      };

      void logger.error(
        error.message || String(message) || 'Global JavaScript error',
        error,
        meta
      );
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
      (!navigator.onLine);

    if (isNetworkError && typeof window !== "undefined") {
      // Импортируем store динамически, чтобы избежать циклических зависимостей
      import("@shared/stores/offlineStore").then(({ useOfflineStore }) => {
        const store = useOfflineStore.getState();
        if (store.isOnline) {
          store.setOnlineStatus(false);
          // Немедленный редирект на страницу офлайна
          if (window.location.pathname !== "/~offline") {
            window.location.href = "/~offline";
          }
        }
      }).catch(() => {
        // Игнорируем ошибки импорта
      });
    }

    if (reason instanceof Error) {
      const meta: LogMeta = {
        operation: 'unhandled_promise_rejection',
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        url: window.location.href,
        userAgent: navigator.userAgent,
        reason: reason.toString(),
        isNetworkError,
        tags: ['global-error', 'unhandled-rejection'],
      };

      void logger.error(
        reason.message || 'Unhandled promise rejection',
        reason,
        meta
      );
    } else {
      // Если причина не Error, создаем искусственную ошибку
      const syntheticError = new Error(`Unhandled rejection: ${reason}`);
      const meta: LogMeta = {
        operation: 'unhandled_promise_rejection_non_error',
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        url: window.location.href,
        userAgent: navigator.userAgent,
        reason: String(reason),
        isNetworkError,
        tags: ['global-error', 'unhandled-rejection'],
      };

      void logger.error(
        syntheticError.message,
        syntheticError,
        meta
      );
    }
  };

  if (mergedConfig.logToConsole) {
    logger.info("✅ Глобальный отлов ошибок настроен", {
      operation: 'setup_global_error_handling',
      appName: mergedConfig.appName,
      environment: mergedConfig.environment
    });
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
