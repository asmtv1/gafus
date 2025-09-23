// Профессиональный логгер для проекта
// Теперь использует единый логгер @gafus/logger

import { 
  createWebLogger, 
  createTrainerPanelLogger, 
  createErrorDashboardLogger,
  createTelegramBotLogger,
  createWorkerLogger,
  createBullBoardLogger,
  type Logger,
  type LogMeta
} from "@gafus/logger";

// Экспортируем типы для обратной совместимости
export type { LogMeta, Logger };

/**
 * Создает логгер с контекстом
 * Автоматически определяет тип приложения по контексту
 * В production режиме отправляет ошибки в error-dashboard
 */
export function createLogger(context: string): Logger {
  // Определяем тип приложения по контексту
  if (context.includes('web') || context.includes('client')) {
    return createWebLogger(context);
  }
  
  if (context.includes('trainer') || context.includes('panel')) {
    return createTrainerPanelLogger(context);
  }
  
  if (context.includes('error-dashboard') || context.includes('dashboard')) {
    return createErrorDashboardLogger(context);
  }
  
  if (context.includes('telegram') || context.includes('bot')) {
    return createTelegramBotLogger(context);
  }
  
  if (context.includes('worker') || context.includes('queue') || context.includes('redis')) {
    return createWorkerLogger(context);
  }
  
  if (context.includes('bull') || context.includes('board')) {
    return createBullBoardLogger(context);
  }
  
  // По умолчанию используем web логгер
  return createWebLogger(context);
}

/**
 * Логгер-заглушка для тестов или случаев когда логирование не нужно
 * Теперь использует silent логгер из @gafus/logger
 */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  success: () => {},
  fatal: () => {},
  dev: () => {},
};

/**
 * Проверяет, нужно ли логировать на определенном уровне
 * Теперь использует логику из @gafus/logger
 */
export function shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && level === "debug") {
    return false;
  }

  return true;
}
