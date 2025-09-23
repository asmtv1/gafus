// Локальный интерфейс для ErrorInfo
interface ErrorInfo {
  componentStack: string;
  errorBoundaryName: string;
  appName: string;
  url: string;
  userAgent: string;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

// Локальный интерфейс для конфигурации
interface ErrorReporterConfig {
  appName: string;
  environment?: string;
  logToConsole?: boolean;
  showErrorDetails?: boolean;
}

import { createLogger } from './logger';

/**
 * Базовый класс для отчетности об ошибках
 * Может использоваться в любых приложениях (React, Node.js, etc.)
 */
export class ErrorReporter {
  private config: ErrorReporterConfig;
  private dashboardUrl: string;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: ErrorReporterConfig) {
    this.config = config;
    // URL дашборда ошибок - можно настроить через переменные окружения
    this.dashboardUrl = process.env.ERROR_DASHBOARD_URL || "http://errors.gafus.localhost";
    // Создаем логгер для error-handling
    this.logger = createLogger(`error-handling-${config.appName}`, config.environment);
  }

  /**
   * Получить конфигурацию
   */
  getConfig(): ErrorReporterConfig {
    return this.config;
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
      this.logger.error("Ошибка при отправке отчета об ошибке", reportingError as Error, {
        originalError: error.message,
        errorInfo: errorInfo,
        additionalContext: additionalContext
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
    this.logger.error(`Ошибка в ${this.config.appName}`, error, {
      componentStack: errorInfo.componentStack,
      errorBoundaryName: errorInfo.errorBoundaryName,
      url: errorInfo.url,
      userAgent: errorInfo.userAgent,
      userId: errorInfo.userId,
      sessionId: errorInfo.sessionId
    });
  }

  /**
   * Отправка в дашборд
   */
  private async sendToDashboard(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      const payload = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        errorInfo,
        timestamp: Date.now(),
        environment: this.config.environment || "development",
      };

      const response = await fetch(`${this.dashboardUrl}/api/errors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (fetchError) {
      this.logger.error("Не удалось отправить ошибку в дашборд", fetchError as Error, {
        dashboardUrl: this.dashboardUrl,
        errorName: error.name,
        errorMessage: error.message,
        appName: this.config.appName
      });
    }
  }
}
