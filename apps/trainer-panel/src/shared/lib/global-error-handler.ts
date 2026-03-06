"use client";

import { reportClientError } from "@gafus/error-handling";

interface GlobalErrorConfig {
  appName?: string;
  environment?: string;
  logToConsole?: boolean;
  showErrorDetails?: boolean;
}

const defaultConfig: GlobalErrorConfig = {
  appName: "trainer-panel-global-handler",
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  logToConsole: true,
  showErrorDetails: process.env.NODE_ENV === "development",
};

export function setupGlobalErrorHandling(config?: Partial<GlobalErrorConfig>) {
  if (typeof window === "undefined") {
    return;
  }

  const mergedConfig = { ...defaultConfig, ...config };

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
    return false;
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const reasonMessage = reason instanceof Error ? reason.message : String(reason);

    const isNetworkError =
      reasonMessage.includes("Failed to fetch") ||
      reasonMessage.includes("ERR_INTERNET_DISCONNECTED") ||
      reasonMessage.includes("NetworkError") ||
      reasonMessage.includes("Network request failed") ||
      !navigator.onLine;

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
    console.info("✅ Глобальный отлов ошибок настроен (trainer-panel)");
  }
}
