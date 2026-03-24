"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import React, { createContext, useContext, useEffect, useState } from "react";

import { useCSRFStore } from "../store";

// Создаем логгер для CSRF Provider
const logger = createWebLogger("csrf-provider");

// ===== ТИПЫ =====
interface CSRFContextType {
  isInitialized: boolean;
  isReady: boolean;
  hasError: boolean;
  errorMessage: string | null;
  retry: () => Promise<void>;
}

// ===== КОНТЕКСТ =====
const CSRFContext = createContext<CSRFContextType | null>(null);

// ===== ПРОВАЙДЕР =====
interface CSRFProviderProps {
  children: React.ReactNode;
  /**
   * Автоматически инициализировать токен при монтировании
   * @default true
   */
  autoInitialize?: boolean;
  /**
   * Показывать ошибки в консоли
   * @default true
   */
  logErrors?: boolean;
  /**
   * Максимальное количество попыток инициализации
   * @default 3
   */
  maxRetries?: number;
  /**
   * Задержка между попытками в миллисекундах
   * @default 1000
   */
  retryDelay?: number;
}

export function CSRFProvider({
  children,
  autoInitialize = true,
  logErrors = true,
  maxRetries = 3,
  retryDelay = 1000,
}: CSRFProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { token, loading, error, fetchToken, refreshToken, isTokenValid, resetRetryCount } =
    useCSRFStore();

  // Проверяем готовность системы
  const isReady = isInitialized && (isTokenValid() || hasError);

  // Функция для повторной попытки
  const retry = async () => {
    setHasError(false);
    setErrorMessage(null);
    setRetryCount(0);
    resetRetryCount();

    try {
      await refreshToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      setHasError(true);
      setErrorMessage(message);

      if (logErrors) {
        logger.error("CSRF Provider retry failed", new Error(message), {
          retryCount: retryCount,
          maxRetries: maxRetries,
        });
      }
      reportClientError(error instanceof Error ? error : new Error(message), {
        issueKey: "CSRFProvider",
        keys: { operation: "retry" },
      });
    }
  };

  // Автоматическая инициализация
  useEffect(() => {
    if (!autoInitialize) {
      setIsInitialized(true);
      return;
    }

    const initialize = async () => {
      try {
        // Если токен уже валиден, не делаем запрос
        if (isTokenValid()) {
          setIsInitialized(true);
          return;
        }

        await fetchToken();
        setIsInitialized(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Неизвестная ошибка";
        setHasError(true);
        setErrorMessage(message);

        if (logErrors) {
          logger.error("CSRF Provider initialization failed", new Error(message), {
            retryCount: retryCount,
            maxRetries: maxRetries,
          });
        }
        reportClientError(error instanceof Error ? error : new Error(message), {
          issueKey: "CSRFProvider",
          keys: { operation: "initialize" },
        });
      }
    };

    initialize();
  }, [autoInitialize, fetchToken, isTokenValid, logErrors]);

  // Обработка ошибок из store
  useEffect(() => {
    if (error && !loading) {
      setHasError(true);
      setErrorMessage(error);

      if (logErrors) {
        logger.error("CSRF Store error", new Error(error), {
          retryCount: retryCount,
          maxRetries: maxRetries,
        });
      }
      reportClientError(new Error(error), {
        issueKey: "CSRFProvider",
        keys: { operation: "storeError" },
      });
    } else if (!error && hasError) {
      setHasError(false);
      setErrorMessage(null);
    }
  }, [error, loading, hasError, logErrors]);

  // Автоматические повторные попытки при ошибках
  useEffect(() => {
    if (hasError && retryCount < maxRetries && !loading) {
      const timer = setTimeout(
        async () => {
          setRetryCount((prev) => prev + 1);
          await retry();
        },
        retryDelay * (retryCount + 1),
      );

      return () => clearTimeout(timer);
    }
  }, [hasError, retryCount, maxRetries, loading, retryDelay]);

  // Логирование состояния только при включённом debug (не засоряет консоль)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      logger.debug("CSRF Provider state", {
        isInitialized,
        isReady,
        hasToken: !!token,
        isTokenValid: isTokenValid(),
        loading,
        hasError,
        errorMessage,
        retryCount,
      });
    }
  }, [isInitialized, isReady, token, isTokenValid, loading, hasError, errorMessage, retryCount]);

  const contextValue: CSRFContextType = {
    isInitialized,
    isReady,
    hasError,
    errorMessage,
    retry,
  };

  return <CSRFContext.Provider value={contextValue}>{children}</CSRFContext.Provider>;
}

// ===== ХУК =====
export function useCSRFContext(): CSRFContextType {
  const context = useContext(CSRFContext);

  if (!context) {
    throw new Error("useCSRFContext must be used within CSRFProvider");
  }

  return context;
}

// ===== УТИЛИТАРНЫЕ КОМПОНЕНТЫ =====
interface CSRFStatusProps {
  showDetails?: boolean;
  className?: string;
}

export function CSRFStatus({ showDetails = false, className = "" }: CSRFStatusProps) {
  const { isReady, hasError, errorMessage } = useCSRFContext();
  const { token, loading, isTokenValid } = useCSRFStore();

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div
      className={`csrf-status ${className}`}
      style={{
        position: "fixed",
        bottom: "10px",
        right: "10px",
        padding: "8px 12px",
        borderRadius: "4px",
        fontSize: "12px",
        fontFamily: "monospace",
        zIndex: 9999,
        backgroundColor: hasError ? "#fee2e2" : isReady ? "#dcfce7" : "#fef3c7",
        color: hasError ? "#dc2626" : isReady ? "#166534" : "#d97706",
        border: `1px solid ${hasError ? "#fecaca" : isReady ? "#bbf7d0" : "#fed7aa"}`,
      }}
    >
      <div>🔒 CSRF: {isReady ? "Ready" : loading ? "Loading" : "Error"}</div>
      {showDetails && (
        <div style={{ marginTop: "4px", fontSize: "10px" }}>
          <div>Token: {token ? "✓" : "✗"}</div>
          <div>Valid: {isTokenValid() ? "✓" : "✗"}</div>
          {hasError && <div>Error: {errorMessage}</div>}
        </div>
      )}
    </div>
  );
}

interface CSRFErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: string; retry: () => void }>;
}

export function CSRFErrorBoundary({
  children,
  fallback: FallbackComponent,
}: CSRFErrorBoundaryProps) {
  const { hasError, errorMessage, retry } = useCSRFContext();

  if (hasError) {
    if (FallbackComponent) {
      return <FallbackComponent error={errorMessage || "Unknown error"} retry={retry} />;
    }

    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          backgroundColor: "#fee2e2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          margin: "20px",
        }}
      >
        <h3 style={{ color: "#dc2626", marginBottom: "10px" }}>🔒 Ошибка CSRF защиты</h3>
        <p style={{ color: "#7f1d1d", marginBottom: "15px" }}>
          {errorMessage || "Не удалось инициализировать защиту от CSRF атак"}
        </p>
        <button
          onClick={retry}
          style={{
            backgroundColor: "#dc2626",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Повторить попытку
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
