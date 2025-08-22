// Профессиональный логгер для проекта

export type LogMeta = Record<string, unknown>;

export interface Logger {
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, meta?: LogMeta) => void;
  debug: (message: string, meta?: LogMeta) => void;
  success: (message: string, meta?: LogMeta) => void;
}

/**
 * Создает логгер с контекстом
 * В production режиме отключает debug логи и уменьшает вербозность
 */
export function createLogger(context: string): Logger {
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";

  const formatMessage = (level: string, message: string, meta?: LogMeta): string => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${context}] ${level}:`;

    if (meta && Object.keys(meta).length > 0) {
      return `${prefix} ${message} ${JSON.stringify(meta)}`;
    }

    return `${prefix} ${message}`;
  };

  return {
    info: (message: string, meta?: LogMeta) => {
      console.log(formatMessage("INFO", message, meta));
    },

    warn: (message: string, meta?: LogMeta) => {
      console.warn(formatMessage("WARN", message, meta));
    },

    error: (message: string, meta?: LogMeta) => {
      console.error(formatMessage("ERROR", message, meta));
    },

    debug: (message: string, meta?: LogMeta) => {
      // В production не выводим debug логи
      if (!isProduction) {
        console.log(formatMessage("DEBUG", message, meta));
      }
    },

    success: (message: string, meta?: LogMeta) => {
      // В production только записываем в консоль без эмодзи
      if (isProduction) {
        console.log(formatMessage("SUCCESS", message, meta));
      } else if (isDevelopment) {
        console.log(formatMessage("✅ SUCCESS", message, meta));
      }
    },
  };
}

/**
 * Логгер-заглушка для тестов или случаев когда логирование не нужно
 */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  success: () => {},
};

/**
 * Проверяет, нужно ли логировать на определенном уровне
 */
export function shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && level === "debug") {
    return false;
  }

  return true;
}
