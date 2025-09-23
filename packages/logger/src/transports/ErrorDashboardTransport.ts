import type { ErrorDashboardLogEntry, LogLevel } from '../logger-types';

/**
 * Кастомный транспорт для отправки логов в error-dashboard
 */
export class ErrorDashboardTransport {
  private errorDashboardUrl: string;
  private appName: string;
  private context?: string;

  constructor(options: {
    errorDashboardUrl: string;
    appName: string;
    context?: string;
  }) {
    this.errorDashboardUrl = options.errorDashboardUrl;
    this.appName = options.appName;
    this.context = options.context;
  }

  /**
   * Отправляет лог в error-dashboard
   */
  async sendToErrorDashboard(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      // Fire-and-forget: не блокируем основной поток
      void this.sendLog(logEntry);
    } catch (error) {
      // Не логируем ошибки отправки логов, чтобы избежать рекурсии
      console.error('[Logger] Failed to send log to error-dashboard:', error);
    }
  }

  /**
   * Внутренний метод отправки
   */
  private async sendLog(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      // Определяем endpoint в зависимости от типа лога
      const endpoint = this.shouldUsePushLogsEndpoint(logEntry) 
        ? `${this.errorDashboardUrl}/push-logs`
        : `${this.errorDashboardUrl}/report`;

      // Формируем данные в формате, ожидаемом error-dashboard
      const payload = this.formatPayloadForDashboard(logEntry);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // В случае ошибки сети, логируем только в консоль
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Logger] Error dashboard unavailable:', error);
      }
    }
  }

  /**
   * Определяет, нужно ли использовать push-logs endpoint
   */
  private shouldUsePushLogsEndpoint(logEntry: ErrorDashboardLogEntry): boolean {
    // Используем push-logs endpoint для:
    // 1. worker приложения
    // 2. webpush сервисов (определяем по контексту)
    // 3. push-notifications сервисов
    return logEntry.appName === 'worker' || 
           logEntry.context?.includes('webpush') ||
           logEntry.service === 'push-notifications';
  }

  /**
   * Форматирует данные для отправки в error-dashboard
   */
  private formatPayloadForDashboard(logEntry: ErrorDashboardLogEntry): any {
    if (this.shouldUsePushLogsEndpoint(logEntry)) {
      // Формат для push-logs endpoint
      return {
        message: logEntry.message,
        context: logEntry.context || 'unknown',
        service: logEntry.context?.includes('webpush') ? 'webpush-service' : logEntry.service,
        level: logEntry.level,
        timestamp: logEntry.timestamp,
        appName: logEntry.appName,
        environment: process.env.NODE_ENV || 'development',
        stack: logEntry.error?.stack,
        additionalContext: {
          ...logEntry.meta,
          error: logEntry.error,
        },
        tags: [logEntry.level, logEntry.context || 'unknown'],
      };
    } else {
      // Формат для report endpoint
      return {
        message: logEntry.message,
        stack: logEntry.error?.stack,
        appName: logEntry.appName,
        environment: process.env.NODE_ENV || 'development',
        url: '/logger',
        userAgent: 'logger-service',
        userId: null,
        sessionId: null,
        componentStack: null,
        additionalContext: {
          ...logEntry.meta,
          context: logEntry.context,
          level: logEntry.level,
          timestamp: logEntry.timestamp,
          error: logEntry.error,
        },
        tags: [logEntry.level, logEntry.context || 'unknown'],
      };
    }
  }

  /**
   * Создает запись лога для отправки
   */
  createLogEntry(
    level: LogLevel,
    message: string,
    error?: Error,
    meta?: Record<string, unknown>
  ): ErrorDashboardLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      appName: this.appName,
      context: this.context,
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      meta,
      service: this.appName,
    };
  }
}
