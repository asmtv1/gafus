import { reportErrorToDashboard } from "./actions/reportError";

import type { ErrorInfo, ErrorBoundaryConfig, ErrorReportData } from "@gafus/types";

/**
 * Базовый класс для отчетности об ошибках
 * Может использоваться в любых приложениях (React, Node.js, etc.)
 */
export class ErrorReporter {
  private config: ErrorBoundaryConfig;

  constructor(config: ErrorBoundaryConfig) {
    this.config = config;
  }

  /**
   * Основной метод для отправки ошибки
   */
  async reportError(
    error: Error,
    errorInfo: Partial<ErrorInfo> = {},
    additionalContext?: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const enhancedErrorInfo = this.enhanceErrorInfo(error, errorInfo, additionalContext);

      // Логируем в консоль если включено
      if (this.config.logToConsole) {
        this.logToConsole(error, enhancedErrorInfo);
      }

      // Отправляем в наш дашборд
      await this.sendToDashboard(error, enhancedErrorInfo);

      return true;
    } catch (reportingError) {
      console.error("Ошибка при отправке отчета об ошибке:", reportingError);
      return false;
    }
  }

  /**
   * Расширение информации об ошибке
   */
  private enhanceErrorInfo(
    error: Error,
    errorInfo: Partial<ErrorInfo>,
    additionalContext?: Record<string, unknown>,
  ): ErrorInfo {
    const baseInfo: ErrorInfo = {
      componentStack: "",
      errorBoundaryName: "ErrorReporter",
      appName: this.config.appName,
      url: this.getUrl(),
      userAgent: this.getUserAgent(),
      timestamp: Date.now(),
      ...errorInfo,
    };

    // Добавляем дополнительный контекст если есть
    if (additionalContext) {
      (baseInfo as ErrorInfo & { additionalContext: Record<string, unknown> }).additionalContext =
        additionalContext;
    }

    return baseInfo;
  }

  /**
   * Получение URL (работает в браузере и Node.js)
   */
  private getUrl(): string {
    if (typeof window !== "undefined" && window.location) {
      return window.location.href;
    }
    if (typeof process !== "undefined" && process.env?.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    return (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SITE_URL) || "unknown";
  }

  /**
   * Получение User Agent
   */
  private getUserAgent(): string {
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      return navigator.userAgent;
    }
    if (typeof process !== "undefined" && process.version) {
      return `Node.js ${process.version}`;
    }
    return "unknown";
  }

  /**
   * Логирование в консоль
   */
  private logToConsole(error: Error, errorInfo: ErrorInfo): void {
    console.warn(`🚨 Ошибка в ${this.config.appName}`);
    console.error("Ошибка:", error);
    console.error("Информация:", errorInfo);
    console.warn();
  }

  /**
   * Отправка в наш дашборд ошибок через Server Action
   */
  private async sendToDashboard(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      const errorData: ErrorReportData = {
        message: error.message,
        stack: error.stack,
        appName: this.config.appName,
        environment: this.config.environment || "development",
        url: errorInfo.url,
        userAgent: errorInfo.userAgent,
        userId: errorInfo.userId,
        sessionId: errorInfo.sessionId,
        componentStack: errorInfo.componentStack,
        additionalContext: (errorInfo as ErrorInfo & { additionalContext: Record<string, unknown> })
          .additionalContext,
        tags: this.generateTags(error, errorInfo),
      };

      const result = await reportErrorToDashboard(errorData);

      if (this.config.logToConsole) {
        if (result.success) {
          console.group("✅ Ошибка отправлена в дашборд");
          console.warn("Error ID:", result.errorId);
          console.groupEnd();
        } else {
          console.group("❌ Ошибка отправки в дашборд");
          console.error("Failed to save error report");
          console.groupEnd();
        }
      }
    } catch (dashboardError) {
      console.error("Ошибка отправки в дашборд:", dashboardError);
    }
  }

  /**
   * Генерация тегов для ошибки
   */
  private generateTags(error: Error, errorInfo: ErrorInfo): string[] {
    const tags: string[] = [];

    // Добавляем тег по типу ошибки
    if (error.name) {
      tags.push(error.name);
    }

    // Добавляем тег по компоненту
    if (errorInfo.errorBoundaryName) {
      tags.push(errorInfo.errorBoundaryName);
    }

    // Добавляем тег по окружению
    if (this.config.environment) {
      tags.push(this.config.environment);
    }

    // Добавляем тег по приложению
    tags.push(this.config.appName);

    return tags;
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<ErrorBoundaryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Получение текущей конфигурации
   */
  getConfig(): ErrorBoundaryConfig {
    return { ...this.config };
  }
}
