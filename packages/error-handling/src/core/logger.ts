export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  appName: string;
  environment: string;
  enableConsole: boolean;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level}] [${this.config.appName}] ${message}${contextStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG) && this.config.enableConsole) {
      console.debug(this.formatMessage("DEBUG", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO) && this.config.enableConsole) {
      console.info(this.formatMessage("INFO", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN) && this.config.enableConsole) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR) && this.config.enableConsole) {
      console.error(this.formatMessage("ERROR", message, context));
      if (error) {
        console.error(error);
      }
    }
  }

  // Метод для логирования только в development
  dev(message: string, context?: Record<string, unknown>): void {
    if (this.config.environment === "development" && this.config.enableConsole) {
      console.warn(`[DEV] ${message}`, context);
    }
  }
}

// Создаем глобальный логгер
export const createLogger = (appName: string, environment = "development"): Logger => {
  const level = environment === "production" ? LogLevel.WARN : LogLevel.DEBUG;

  return new Logger({
    level,
    appName,
    environment,
    enableConsole: true,
  });
};
