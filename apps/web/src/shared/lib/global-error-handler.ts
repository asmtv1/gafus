"use client";

import { ErrorReporter } from "./ErrorReporter";

import type { ErrorBoundaryConfig } from "@gafus/types";

let globalErrorReporter: ErrorReporter | null = null;

const defaultConfig: ErrorBoundaryConfig = {
  appName: "web-global-handler",
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  logToConsole: true,
  showErrorDetails: process.env.NODE_ENV === "development",
};

export function setupGlobalErrorHandling(config?: Partial<ErrorBoundaryConfig>) {
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
      console.error("Глобальная ошибка JS:", error);
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
      console.error("Необработанный Promise rejection:", event.reason);
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
    console.warn("✅ Глобальный отлов ошибок настроен.");
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
