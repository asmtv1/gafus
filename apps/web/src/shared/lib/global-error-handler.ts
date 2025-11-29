"use client";

import { ErrorReporter, createWebLogger, type ErrorReporterConfig } from "@gafus/logger";

// Создаем логгер для клиентской части
const logger = createWebLogger('web-global-error-handler');

let globalErrorReporter: ErrorReporter | null = null;

const defaultConfig: ErrorReporterConfig = {
  appName: "web-global-handler",
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  logToConsole: true,
  showErrorDetails: process.env.NODE_ENV === "development",
};

export function setupGlobalErrorHandling(config?: Partial<ErrorReporterConfig>) {
  if (typeof window === "undefined") {
    return;
  }

  const mergedConfig = { ...defaultConfig, ...config };

  if (!globalErrorReporter) {
    globalErrorReporter = new ErrorReporter(mergedConfig);
  } else {
    globalErrorReporter.updateConfig(mergedConfig);
  }

  // Отлов необработанных ошибок JavaScript
  window.onerror = (message, source, lineno, colno, error) => {
    if (error && globalErrorReporter) {
      logger.error("Глобальная ошибка JS", error, {
        operation: 'global_js_error',
        source: source,
        lineno: lineno,
        colno: colno,
        message: message
      });
      globalErrorReporter.reportError(error, {
        componentStack: `Global (window.onerror) - ${source}:${lineno}:${colno}`,
        errorBoundaryName: "GlobalErrorHandler",
        appName: mergedConfig.appName,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    }
    return false; // Возвращаем false, чтобы браузер продолжил обработку (например, вывод в консоль)
  };

  // Отлов необработанных Promise rejections
  window.onunhandledrejection = (event) => {
    if (event.reason instanceof Error && globalErrorReporter) {
      logger.error("Необработанный Promise rejection", event.reason, {
        operation: 'unhandled_promise_rejection',
        reason: event.reason.toString()
      });
      globalErrorReporter.reportError(event.reason, {
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        appName: mergedConfig.appName,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    } else if (globalErrorReporter) {
      // Если причина не Error, создаем искусственную ошибку
      const syntheticError = new Error(`Unhandled rejection: ${event.reason}`);
      logger.error("Необработанный Promise rejection (не Error)", syntheticError, {
        operation: 'unhandled_promise_rejection_non_error',
        reason: String(event.reason)
      });
      globalErrorReporter.reportError(syntheticError, {
        componentStack: `Global (unhandledrejection)`,
        errorBoundaryName: "GlobalPromiseHandler",
        appName: mergedConfig.appName,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
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
