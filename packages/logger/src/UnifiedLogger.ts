import pino, { Logger as PinoLogger } from 'pino';
import type { Logger, LoggerConfig, LogMeta, LogLevel } from './logger-types.js';
import { ErrorDashboardTransport } from './transports/ErrorDashboardTransport.js';

/**
 * Единый логгер на основе Pino с интеграцией в error-dashboard
 */
export class UnifiedLogger implements Logger {
  private pinoLogger: PinoLogger;
  private config: LoggerConfig;
  private errorDashboardTransport?: ErrorDashboardTransport;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.pinoLogger = this.createPinoLogger();
    
    if (config.enableErrorDashboard && config.errorDashboardUrl) {
      this.errorDashboardTransport = new ErrorDashboardTransport({
        errorDashboardUrl: config.errorDashboardUrl,
        appName: config.appName,
        context: config.context,
        lokiUrl: config.lokiUrl,
      });
    }
  }

  /**
   * Создает экземпляр Pino логгера
   */
  private createPinoLogger(): PinoLogger {
    // По умолчанию отключаем worker-базированные транспорты (pino-pretty/pino/file),
    // т.к. они используют worker_threads и могут падать в Next.js окружении ("the worker has exited").
    // Включить можно явно через PINO_USE_WORKER_TRANSPORTS=true
    const allowWorkerTransports = process.env.PINO_USE_WORKER_TRANSPORTS === 'true';

    if (allowWorkerTransports && this.config.enableConsole) {
      const transports = [];
      if (this.config.environment === 'development') {
        transports.push({
          target: 'pino-pretty',
          level: this.config.level,
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        });
      } else {
        transports.push({
          target: 'pino/file',
          level: this.config.level,
          options: { destination: 1 }, // stdout
        });
      }

      return pino({
        level: this.config.level,
        base: {
          app: this.config.appName,
          context: this.config.context,
        },
        transport: { targets: transports },
      });
    }

    // Без транспортов — базовый pino без worker_threads
    return pino({
      level: this.config.level,
      base: {
        app: this.config.appName,
        context: this.config.context,
      },
    });
  }

  /**
   * Проверяет, нужно ли логировать на данном уровне
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 10,
      info: 20,
      success: 20, // success на том же уровне, что и info
      warn: 30,
      error: 40,
      fatal: 50,
    };
    
    return levels[level] >= levels[this.config.level];
  }

  /**
   * Отправляет лог в error-dashboard если настроено
   */
  private async sendToErrorDashboard(
    level: LogLevel,
    message: string,
    error?: Error,
    meta?: LogMeta
  ): Promise<void> {
    if (this.errorDashboardTransport) {
      // Для worker приложений отправляем все уровни (включая info и success для push-логов)
      const isWorker = this.config.appName === 'worker' || 
                      this.config.context?.includes('webpush') ||
                      this.config.context?.includes('push-notifications');
      
      // В production отправляем warn, error и fatal
      // В development отправляем только error и fatal
      // Для worker отправляем все уровни (info, success, warn, error, fatal)
      const shouldSend = isWorker
        ? ['info', 'success', 'warn', 'error', 'fatal'].includes(level)
        : (this.config.environment === 'production' 
        ? ['warn', 'error', 'fatal'].includes(level)
            : ['error', 'fatal'].includes(level));

      if (shouldSend) {
        const logEntry = this.errorDashboardTransport.createLogEntry(
          level,
          message,
          error,
          meta
        );
        await this.errorDashboardTransport.sendToErrorDashboard(logEntry);
      }
    }
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog('debug')) {
      this.pinoLogger.debug(meta, message);
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog('info')) {
      this.pinoLogger.info(meta, message);
      // Отправляем info в error-dashboard для worker приложений
      void this.sendToErrorDashboard('info', message, undefined, meta);
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog('warn')) {
      this.pinoLogger.warn(meta, message);
      // Отправляем warn в error-dashboard в production
      void this.sendToErrorDashboard('warn', message, undefined, meta);
    }
  }

  async error(message: string, error?: Error, meta?: LogMeta): Promise<void> {
    if (this.shouldLog('error')) {
      this.pinoLogger.error({ err: error, ...meta }, message);
      await this.sendToErrorDashboard('error', message, error, meta);
    }
  }

  async fatal(message: string, error?: Error, meta?: LogMeta): Promise<void> {
    if (this.shouldLog('fatal')) {
      this.pinoLogger.fatal({ err: error, ...meta }, message);
      await this.sendToErrorDashboard('fatal', message, error, meta);
    }
  }

  dev(message: string, meta?: LogMeta): void {
    if (this.config.environment === 'development') {
      this.pinoLogger.info({ dev: true, ...meta }, `[DEV] ${message}`);
    }
  }

  success(message: string, meta?: LogMeta): void {
    if (this.shouldLog('info')) {
      const emoji = this.config.environment === 'development' ? '✅ ' : '';
      this.pinoLogger.info({ success: true, ...meta }, `${emoji}SUCCESS: ${message}`);
      // Отправляем success в error-dashboard для worker приложений
      void this.sendToErrorDashboard('success', message, undefined, meta);
    }
  }

  /**
   * Получает базовый Pino логгер для расширенного использования
   */
  getPinoLogger(): PinoLogger {
    return this.pinoLogger;
  }

  /**
   * Обновляет конфигурацию логгера
   */
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Пересоздаем Pino логгер с новой конфигурацией
    this.pinoLogger = this.createPinoLogger();
    
    // Обновляем транспорт error-dashboard
    if (newConfig.enableErrorDashboard && newConfig.errorDashboardUrl) {
      this.errorDashboardTransport = new ErrorDashboardTransport({
        errorDashboardUrl: newConfig.errorDashboardUrl,
        appName: this.config.appName,
        context: this.config.context,
        lokiUrl: newConfig.lokiUrl || this.config.lokiUrl,
      });
    }
  }
}
