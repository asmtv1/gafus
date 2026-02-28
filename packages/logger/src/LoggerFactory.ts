import type {
  Logger,
  LoggerConfig,
  CreateLoggerOptions,
  Environment,
  LogLevel,
} from "./logger-types.js";
import { UnifiedLogger } from "./UnifiedLogger.js";

/**
 * Определяет уровень логирования по окружению
 */
function getDefaultLogLevel(environment: Environment): LogLevel {
  // Проверяем переменную окружения для полного отключения логов
  if (process.env.DISABLE_LOGGING === "true") {
    return "fatal"; // Только критические ошибки
  }

  switch (environment) {
    case "development":
      return "debug";
    case "test":
      return "warn";
    case "production":
      return "warn";
    default:
      return "info";
  }
}

/**
 * Определяет окружение из переменных окружения
 */
function getEnvironment(): Environment {
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "production" || env === "test") {
    return env;
  }
  return "development";
}

/**
 * Создает конфигурацию логгера из опций
 */
function createLoggerConfig(options: CreateLoggerOptions): LoggerConfig {
  const environment = options.environment || getEnvironment();
  const level = options.level || getDefaultLogLevel(environment);

  const disableLogging = process.env.DISABLE_LOGGING === "true";
  const disableConsole = process.env.DISABLE_CONSOLE_LOGGING === "true";

  return {
    appName: options.appName,
    environment,
    level,
    enableConsole: !disableLogging && !disableConsole && options.enableConsole !== false,
    context: options.context,
  };
}

/**
 * Фабрика для создания логгеров
 */
export class LoggerFactory {
  private static instances = new Map<string, Logger>();

  /**
   * Создает новый логгер с заданными опциями
   */
  static createLogger(options: CreateLoggerOptions): Logger {
    const config = createLoggerConfig(options);
    return new UnifiedLogger(config);
  }

  /**
   * Создает логгер с контекстом (кэшируется по ключу)
   */
  static createLoggerWithContext(
    appName: string,
    context: string,
    options: Omit<CreateLoggerOptions, "appName" | "context"> = {},
  ): Logger {
    const key = `${appName}:${context}`;

    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    const logger = this.createLogger({
      appName,
      context,
      ...options,
    });

    this.instances.set(key, logger);
    return logger;
  }

  /**
   * Создает логгер для приложения (кэшируется по названию приложения)
   */
  static createAppLogger(
    appName: string,
    options: Omit<CreateLoggerOptions, "appName"> = {},
  ): Logger {
    if (this.instances.has(appName)) {
      return this.instances.get(appName)!;
    }

    const logger = this.createLogger({
      appName,
      ...options,
    });

    this.instances.set(appName, logger);
    return logger;
  }

  /**
   * Очищает кэш логгеров
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Получает все созданные логгеры
   */
  static getAllLoggers(): Map<string, Logger> {
    return new Map(this.instances);
  }
}

/**
 * Удобные функции для быстрого создания логгеров
 */

/**
 * Создает логгер для веб-приложения
 */
export function createWebLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("web", context || "web-app");
}

/**
 * Создает логгер для панели тренера
 */
export function createTrainerPanelLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("trainer-panel", context || "trainer-panel");
}

/**
 * Создает логгер для telegram-bot
 */
export function createTelegramBotLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("telegram-bot", context || "telegram-bot");
}

/**
 * Создает логгер для worker
 */
export function createWorkerLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("worker", context || "worker");
}

/**
 * Создает логгер для bull-board
 */
export function createBullBoardLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("bull-board", context || "bull-board");
}

/**
 * Создает логгер для admin-panel
 */
export function createAdminPanelLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("admin-panel", context || "admin-panel");
}

/**
 * Создает "тихий" логгер (только критические ошибки)
 */
export function createSilentLogger(context?: string): Logger {
  return LoggerFactory.createLoggerWithContext("silent", context || "silent", {
    level: "fatal",
    enableConsole: false,
  });
}
