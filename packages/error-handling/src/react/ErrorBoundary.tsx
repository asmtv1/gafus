"use client";

import type { ReactNode } from "react";
import React, { Component } from "react";
import { LoggerFactory, type Logger, type LogMeta } from "@gafus/logger";

export interface ErrorBoundaryConfig {
  appName: string;
  environment?: string;
  logToConsole?: boolean;
  showErrorDetails?: boolean;
}

export interface ErrorInfo {
  componentStack?: string;
  errorBoundaryName?: string;
  appName: string;
  url: string;
  userAgent: string;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  additionalContext?: Record<string, unknown>;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  config?: ErrorBoundaryConfig;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary компонент для отлова ошибок React
 * Может использоваться в любых React приложениях проекта
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private logger: Logger;
  private config: ErrorBoundaryConfig;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };

    // Настройки по умолчанию
    const defaultConfig: ErrorBoundaryConfig = {
      appName: "react-app",
      environment: process.env.NODE_ENV || "development",
      logToConsole: true,
      showErrorDetails: false, // Не показываем детали пользователям
      ...props.config,
    };

    this.config = defaultConfig;

    // Создаем логгер с кэшированием (как в createWebLogger)
    this.logger = LoggerFactory.createLoggerWithContext(defaultConfig.appName, "error-boundary", {
      enableErrorDashboard: true,
      enableConsole: defaultConfig.logToConsole,
    });
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const enhancedErrorInfo: ErrorInfo = {
      componentStack: errorInfo.componentStack || "",
      errorBoundaryName: "ErrorBoundary",
      appName: this.config.appName,
      userId:
        typeof window !== "undefined" ? localStorage.getItem("userId") || undefined : undefined,
      sessionId:
        typeof window !== "undefined"
          ? sessionStorage.getItem("sessionId") || undefined
          : undefined,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      timestamp: Date.now(),
    };

    this.setState({ errorInfo: enhancedErrorInfo });

    // Формируем метаданные для логгера
    const meta: LogMeta = {
      operation: "error_boundary",
      componentStack: enhancedErrorInfo.componentStack,
      errorBoundaryName: enhancedErrorInfo.errorBoundaryName,
      url: enhancedErrorInfo.url,
      userAgent: enhancedErrorInfo.userAgent,
      userId: enhancedErrorInfo.userId,
      sessionId: enhancedErrorInfo.sessionId,
      ...enhancedErrorInfo.additionalContext,
      tags: ["error-boundary", "react-error"],
    };

    // Отправляем ошибку напрямую через logger
    void this.logger.error(error.message || "React component error", error, meta);

    // Вызываем пользовательский обработчик если есть
    if (this.props.onError) {
      this.props.onError(error, enhancedErrorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });

    // Перезагружаем страницу для полного сброса состояния
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): React.ReactElement | null {
    if (this.state.hasError) {
      // Если передан кастомный fallback, используем его
      if (this.props.fallback) {
        return this.props.fallback as React.ReactElement;
      }

      // Стандартный UI для ошибки
      return (
        <ErrorFallbackUI
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          showDetails={this.config.showErrorDetails}
          appName={this.config.appName}
        />
      );
    }

    return this.props.children as React.ReactElement | null;
  }
}

interface ErrorFallbackUIProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  showDetails?: boolean;
  appName?: string;
}

function ErrorFallbackUI({ onReset, appName }: ErrorFallbackUIProps) {
  const getAppSpecificMessage = (appName?: string) => {
    switch (appName) {
      case "trainer-panel":
        return "Произошла непредвиденная ошибка в панели тренера. Пожалуйста, попробуйте перезагрузить страницу.";
      case "web-global":
        return "Произошла непредвиденная ошибка. Пожалуйста, попробуйте перезагрузить страницу.";
      default:
        return "Произошла непредвиденная ошибка. Пожалуйста, попробуйте перезагрузить страницу.";
    }
  };

  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          fontSize: "48px",
          marginBottom: "20px",
          color: "#dc2626",
        }}
      >
        ⚠️
      </div>

      <h1
        style={{
          fontSize: "24px",
          fontWeight: "600",
          marginBottom: "16px",
          color: "#1f2937",
        }}
      >
        Упс! Что-то пошло не так
      </h1>

      <p
        style={{
          fontSize: "16px",
          color: "#4b5563",
          marginBottom: "24px",
          lineHeight: "1.5",
        }}
      >
        {getAppSpecificMessage(appName)}
      </p>

      <button
        onClick={onReset}
        style={{
          background: "#3b82f6",
          color: "white",
          border: "none",
          padding: "12px 24px",
          borderRadius: "6px",
          fontSize: "16px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "background-color 0.2s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#2563eb";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "#3b82f6";
        }}
      >
        Перезагрузить страницу
      </button>
    </div>
  );
}
