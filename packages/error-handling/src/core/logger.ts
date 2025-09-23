// Профессиональный логгер для обработки ошибок
// Теперь использует единый логгер @gafus/logger

import { 
  createErrorDashboardLogger,
  createWebLogger,
  createTrainerPanelLogger,
  createTelegramBotLogger,
  createWorkerLogger,
  createBullBoardLogger,
  type Logger,
  type LogMeta
} from "@gafus/logger";

// Экспортируем типы для обратной совместимости
export type { LogMeta, Logger };

// Маппинг уровней логов для обратной совместимости
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

/**
 * Создает логгер с контекстом
 * Автоматически определяет тип приложения по имени
 * В production режиме отправляет ошибки в error-dashboard
 */
export const createLogger = (appName: string, environment = "development"): Logger => {
  // Определяем тип приложения по имени
  if (appName.includes('error-dashboard') || appName.includes('dashboard')) {
    return createErrorDashboardLogger(appName);
  }
  
  if (appName.includes('web') || appName.includes('client')) {
    return createWebLogger(appName);
  }
  
  if (appName.includes('trainer') || appName.includes('panel')) {
    return createTrainerPanelLogger(appName);
  }
  
  if (appName.includes('telegram') || appName.includes('bot')) {
    return createTelegramBotLogger(appName);
  }
  
  if (appName.includes('worker') || appName.includes('queue') || appName.includes('redis')) {
    return createWorkerLogger(appName);
  }
  
  if (appName.includes('bull') || appName.includes('board')) {
    return createBullBoardLogger(appName);
  }
  
  // По умолчанию используем error-dashboard логгер (но без отправки в себя)
  return createErrorDashboardLogger(appName);
};
