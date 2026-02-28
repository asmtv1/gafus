/**
 * Уровни логирования
 */
export type LogLevel = "debug" | "info" | "success" | "warn" | "error" | "fatal";

/**
 * Окружения приложения
 */
export type Environment = "development" | "production" | "test";

/**
 * Конфигурация логгера
 */
export interface LoggerConfig {
  appName: string;
  environment: Environment;
  level: LogLevel;
  enableConsole: boolean;
  context?: string;
}

/**
 * Метаданные для лога
 */
export type LogMeta = Record<string, unknown>;

/**
 * Интерфейс логгера
 */
export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, error?: Error, meta?: LogMeta): void;
  fatal(message: string, error?: Error, meta?: LogMeta): void;

  /** Логирование только в development */
  dev(message: string, meta?: LogMeta): void;

  /** Логирование успешных операций */
  success(message: string, meta?: LogMeta): void;
}

/**
 * Конфигурация для создания логгера
 */
export interface CreateLoggerOptions {
  appName: string;
  context?: string;
  environment?: Environment;
  level?: LogLevel;
  enableConsole?: boolean;
}
