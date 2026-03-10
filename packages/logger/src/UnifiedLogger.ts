import type { Logger as PinoLogger } from "pino";
import pino from "pino";

import { reportServerError } from "./tracerServer.js";
import type { Logger, LoggerConfig, LogMeta, LogLevel } from "./logger-types.js";

/**
 * Единый логгер на основе Pino.
 * Логи → stdout (docker logs). Ошибки → Tracer.
 */
export class UnifiedLogger implements Logger {
  private pinoLogger: PinoLogger;
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.pinoLogger = this.createPinoLogger();
  }

  /**
   * Создает экземпляр Pino логгера
   */
  private createPinoLogger(): PinoLogger {
    // По умолчанию отключаем worker-базированные транспорты (pino-pretty/pino/file),
    // т.к. они используют worker_threads и могут падать в Next.js окружении ("the worker has exited").
    // Включить можно явно через PINO_USE_WORKER_TRANSPORTS=true
    //
    // Исключение: для worker приложений (не Next.js) всегда используем транспорты для гарантированной записи в stdout
    const isWorkerApp = this.config.appName === "worker" || this.config.appName === "telegram-bot";
    const allowWorkerTransports = process.env.PINO_USE_WORKER_TRANSPORTS === "true" || isWorkerApp;

    if (allowWorkerTransports && this.config.enableConsole) {
      const transports = [];
      if (this.config.environment === "development") {
        transports.push({
          target: "pino-pretty",
          level: this.config.level,
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        });
      } else {
        transports.push({
          target: "pino/file",
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
    // Pino по умолчанию пишет в process.stdout, но для гарантии явно указываем
    // Это необходимо для контейнеров, где логи должны попадать в Docker logs
    if (this.config.enableConsole) {
      return pino(
        {
          level: this.config.level,
          base: {
            app: this.config.appName,
            context: this.config.context,
          },
        },
        process.stdout, // Явно указываем stdout для гарантированной записи
      );
    }

    // Если консоль отключена, создаем logger без вывода
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

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog("debug")) {
      this.pinoLogger.debug(meta, message);
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog("info")) {
      this.pinoLogger.info(meta, message);
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog("warn")) {
      this.pinoLogger.warn(meta, message);
    }
  }

  error(message: string, error?: Error, meta?: LogMeta): void {
    if (this.shouldLog("error")) {
      this.pinoLogger.error({ err: error, ...meta }, message);
      if (error instanceof Error) {
        reportServerError(error, {
          appName: this.config.appName,
          context: this.config.context,
          message,
          severity: "error",
        });
      }
    }
  }

  fatal(message: string, error?: Error, meta?: LogMeta): void {
    if (this.shouldLog("fatal")) {
      this.pinoLogger.fatal({ err: error, ...meta }, message);
      if (error instanceof Error) {
        reportServerError(error, {
          appName: this.config.appName,
          context: this.config.context,
          message,
          severity: "fatal",
        });
      }
    }
  }

  dev(message: string, meta?: LogMeta): void {
    if (this.config.environment === "development") {
      this.pinoLogger.info({ dev: true, ...meta }, `[DEV] ${message}`);
    }
  }

  success(message: string, meta?: LogMeta): void {
    if (this.shouldLog("info")) {
      const emoji = this.config.environment === "development" ? "✅ " : "";
      this.pinoLogger.info({ success: true, ...meta }, `${emoji}SUCCESS: ${message}`);
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
    this.pinoLogger = this.createPinoLogger();
  }
}
