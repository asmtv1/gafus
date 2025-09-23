/**
 * Уровни логирования
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Окружения приложения
 */
export type Environment = 'development' | 'production' | 'test';

/**
 * Конфигурация логгера
 */
export interface LoggerConfig {
  /** Название приложения */
  appName: string;
  /** Окружение */
  environment: Environment;
  /** Уровень логирования */
  level: LogLevel;
  /** Включить консольный вывод */
  enableConsole: boolean;
  /** Включить отправку в error-dashboard */
  enableErrorDashboard: boolean;
  /** Контекст логгера (например, название модуля) */
  context?: string;
  /** URL error-dashboard для отправки логов */
  errorDashboardUrl?: string;
}

/**
 * Метаданные для лога
 */
export interface LogMeta {
  [key: string]: unknown;
}

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
  /** Название приложения */
  appName: string;
  /** Контекст (название модуля/сервиса) */
  context?: string;
  /** Окружение (по умолчанию из NODE_ENV) */
  environment?: Environment;
  /** Уровень логирования (автоматически определяется по окружению) */
  level?: LogLevel;
  /** Включить консольный вывод */
  enableConsole?: boolean;
  /** Включить отправку в error-dashboard */
  enableErrorDashboard?: boolean;
  /** URL error-dashboard */
  errorDashboardUrl?: string;
}

/**
 * Запись лога для отправки в error-dashboard
 */
export interface ErrorDashboardLogEntry {
  timestamp: string;
  level: LogLevel;
  appName: string;
  context?: string;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  meta?: LogMeta;
  service: string;
}
