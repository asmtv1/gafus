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
    if (event.reason instanceof Error) {
      const meta: LogMeta = {
        operation: 'unhandled_promise_rejection',
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        url: window.location.href,
        userAgent: navigator.userAgent,
        reason: event.reason.toString(),
        tags: ['global-error', 'unhandled-rejection'],
      };

      void logger.error(
        event.reason.message || 'Unhandled promise rejection',
        event.reason,
        meta
      );
    } else {
      // Если причина не Error, создаем искусственную ошибку
      const syntheticError = new Error(`Unhandled rejection: ${event.reason}`);
      const meta: LogMeta = {
        operation: 'unhandled_promise_rejection_non_error',
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        url: window.location.href,
        userAgent: navigator.userAgent,
        reason: String(event.reason),
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
