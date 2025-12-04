import type { ErrorDashboardLogEntry, LogLevel } from '../logger-types.js';

/**
 * Кастомный транспорт для отправки логов в Loki и error-dashboard
 */
export class ErrorDashboardTransport {
  private errorDashboardUrl: string;
  private lokiUrl: string;
  private appName: string;
  private context?: string;

  constructor(options: {
    errorDashboardUrl: string;
    appName: string;
    context?: string;
    lokiUrl?: string;
  }) {
    this.errorDashboardUrl = options.errorDashboardUrl;
    // Для локальной разработки используем localhost, для Docker - loki
    const defaultLokiUrl = process.env.NODE_ENV === 'production' 
      ? 'http://loki:3100'
      : 'http://localhost:3100';
    this.lokiUrl = options.lokiUrl || process.env.LOKI_URL || defaultLokiUrl;
    this.appName = options.appName;
    this.context = options.context;
  }

  /**
   * Отправляет лог в error-dashboard
   * 
   * ВРЕМЕННО: Прямая отправка в Loki включена для локального тестирования.
   * В production логи идут через stdout → Promtail → Loki (стандартная архитектура)
   */
  async sendToErrorDashboard(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      // Записываем error/fatal в БД для Error Dashboard
      if (logEntry.level === 'error' || logEntry.level === 'fatal') {
        void this.sendToDatabase(logEntry);
      }
      
      // ВРЕМЕННО: Прямая отправка в Loki для локального тестирования
      // В production отключить и использовать Promtail
      void this.sendToLoki(logEntry);
      
      // Опционально: отправляем в error-dashboard API для уведомлений
      // void this.sendToErrorDashboardAPI(logEntry);
    } catch (error) {
      // Не логируем ошибки отправки логов, чтобы избежать рекурсии
      console.error('[Logger] Failed to send log:', error);
    }
  }

  /**
   * Отправляет лог в Loki через Push API
   */
  private async sendToLoki(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      const lokiEndpoint = `${this.lokiUrl}/loki/api/v1/push`;
      const normalizedTimestamp = logEntry.timestamp || new Date().toISOString();
      const logLevel = logEntry.level || 'error';
      
      // Формируем метки для Loki
      const labels: Record<string, string> = {
        app: this.appName,
        level: logLevel,
        environment: process.env.NODE_ENV || 'development',
      };

      // Добавляем контекст, если есть
      if (this.context) {
        labels.context = this.context;
      }

      // Добавляем теги для идентификации типа лога
      if (this.shouldUsePushLogsEndpoint(logEntry)) {
        labels.tag_push_notifications = 'true';
      } else {
        labels.tag_error_report = 'true';
      }

      // Формируем полные данные ошибки в JSON формате
      const isPushLog = this.shouldUsePushLogsEndpoint(logEntry);
      const additionalContext: Record<string, unknown> = {
        ...(logEntry.meta || {}),
        context: this.context,
        level: logLevel,
        timestamp: normalizedTimestamp,
        error: logEntry.error,
      };

      // Для push-логов добавляем pushSpecific структуру
      if (isPushLog) {
        additionalContext.pushSpecific = {
          level: logLevel,
          context: this.context || 'unknown',
          service: this.context?.includes('webpush') ? 'webpush-service' : this.appName,
          timestamp: normalizedTimestamp,
          endpoint: logEntry.meta?.endpoint as string | undefined || null,
          notificationId: logEntry.meta?.notificationId as string | undefined || null,
        };
      }

      const logData = {
        level: logLevel,
        message: logEntry.message,
        stack: logEntry.error?.stack || null,
        url: '/logger',
        userAgent: 'logger-service',
        userId: logEntry.meta?.userId as string | null || null,
        sessionId: logEntry.meta?.sessionId as string | null || null,
        componentStack: logEntry.meta?.componentStack as string | null || null,
        additionalContext,
        tags: [
          logLevel,
          this.context || 'unknown',
          ...(isPushLog ? ['push-notifications'] : []),
        ],
        timestamp: normalizedTimestamp,
      };

      // Формат Loki Push API
      const payload = {
        streams: [{
          stream: labels,
          values: [[
            // Timestamp в наносекундах
            String(Date.parse(normalizedTimestamp) * 1000000),
            JSON.stringify(logData),
          ]],
        }],
      };

      const response = await fetch(lokiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Loki HTTP ${response.status}: ${response.statusText}. ${errorText ? `Response: ${errorText.substring(0, 200)}` : ""}`);
      }

      // Логирование успешной отправки
      if (process.env.NODE_ENV === 'development') {
        console.log('[ErrorDashboardTransport] Log sent to Loki:', {
          app: this.appName,
          context: this.context,
          level: logEntry.level,
          isPushLog,
          labels: Object.keys(labels),
          lokiUrl: this.lokiUrl,
        });
      }
    } catch (error) {
      // В случае ошибки сети, логируем только в консоль
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ErrorDashboardTransport] Failed to send log to Loki:', {
          app: this.appName,
          context: this.context,
          level: logEntry.level,
          error: error instanceof Error ? error.message : String(error),
          lokiUrl: this.lokiUrl,
        });
      }
    }
  }

  /**
   * Отправляет лог в PostgreSQL для Error Dashboard
   */
  private async sendToDatabase(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      // Dynamic import для избежания circular dependencies
      const { prisma } = await import('@gafus/prisma');
      
      await prisma.errorLog.create({
        data: {
          message: logEntry.message,
          stack: logEntry.error?.stack || null,
          level: logEntry.level || 'error',
          appName: logEntry.appName || this.appName,
          environment: process.env.NODE_ENV || 'development',
          context: logEntry.context || this.context || null,
          url: '/logger',
          userAgent: 'logger-service',
          userId: (logEntry.meta?.userId as string) || null,
          sessionId: (logEntry.meta?.sessionId as string) || null,
          componentStack: (logEntry.meta?.componentStack as string) || null,
          additionalContext: logEntry.meta ? JSON.parse(JSON.stringify(logEntry.meta)) : {},
          tags: [
            logEntry.level || 'error',
            logEntry.context || this.context || 'unknown',
          ],
          timestamp: new Date(logEntry.timestamp || Date.now()),
          status: 'new',
        },
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ErrorDashboardTransport] Error saved to database:', {
          app: this.appName,
          context: this.context,
          level: logEntry.level,
        });
      }
    } catch (error) {
      // В случае ошибки сети/БД, логируем только в консоль
      console.error('[ErrorDashboardTransport] Failed to save error to database:', {
        app: this.appName,
        context: this.context,
        level: logEntry.level,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Отправляет лог в error-dashboard API (для обратной совместимости)
   */
  private async sendToErrorDashboardAPI(logEntry: ErrorDashboardLogEntry): Promise<void> {
    try {
      // Нормализуем URL - убираем /api в конце, если есть
      const baseUrl = this.errorDashboardUrl.endsWith('/api') 
        ? this.errorDashboardUrl.slice(0, -4)
        : this.errorDashboardUrl.replace(/\/api$/, '');
      
      // Определяем endpoint в зависимости от типа лога
      const endpoint = this.shouldUsePushLogsEndpoint(logEntry) 
        ? `${baseUrl}/api/push-logs`
        : `${baseUrl}/api/report`;

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
      // Извлекаем notificationId и endpoint из meta, если они есть
      const notificationId = logEntry.meta?.notificationId as string | undefined;
      const endpoint = logEntry.meta?.endpoint as string | undefined;
      
      return {
        message: logEntry.message,
        context: logEntry.context || 'unknown',
        service: logEntry.context?.includes('webpush') ? 'webpush-service' : logEntry.service || logEntry.appName,
        level: logEntry.level,
        timestamp: logEntry.timestamp || new Date().toISOString(),
        appName: logEntry.appName,
        environment: process.env.NODE_ENV || 'development',
        stack: logEntry.error?.stack,
        notificationId,
        endpoint,
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
