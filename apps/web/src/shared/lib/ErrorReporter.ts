import { reportErrorToDashboard } from "./actions/reportError";
import { createWebLogger } from "@gafus/logger";

import type { ErrorInfo, ErrorBoundaryConfig, ErrorReportData } from "@gafus/types";

// Создаем логгер для ErrorReporter
const logger = createWebLogger('web-error-reporter');

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
      logger.error("Ошибка при отправке отчета об ошибке", reportingError as Error, {
        operation: 'send_error_report_failed',
        appName: this.config.appName,
        environment: this.config.environment
      });
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
    logger.warn(`🚨 Ошибка в ${this.config.appName}`, {
      operation: 'log_error_to_console',
      appName: this.config.appName,
      errorMessage: error.message,
      errorStack: error.stack
    });
    logger.error("Ошибка:", error, {
      operation: 'log_error_details',
      appName: this.config.appName
    });
    logger.error("Информация:", new Error("Error info"), {
      operation: 'log_error_info',
      appName: this.config.appName,
      errorInfo: errorInfo
    });
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
          logger.success('✅ Ошибка отправлена в дашборд', {
            operation: 'error_sent_to_dashboard',
            errorId: result.errorId,
            appName: this.config.appName
          });
        } else {
          logger.error('❌ Ошибка отправки в дашборд', new Error('Failed to save error report'), {
            operation: 'error_dashboard_send_failed',
            appName: this.config.appName
          });
        }
      }
    } catch (dashboardError) {
      logger.error("Ошибка отправки в дашборд", dashboardError as Error, {
        operation: 'dashboard_send_error',
        appName: this.config.appName
      });
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
