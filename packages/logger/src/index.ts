/**
 * @gafus/logger - Единый логгер для всех приложений Gafus
 * 
 * Этот пакет предоставляет единую систему логирования на основе Pino
 * с интеграцией в error-dashboard для централизованного сбора ошибок.
 */

// Основные классы и интерфейсы
export { UnifiedLogger } from './UnifiedLogger';
export { LoggerFactory } from './LoggerFactory';
export { ErrorDashboardTransport } from './transports/ErrorDashboardTransport';

// Типы и интерфейсы
export type {
  Logger,
  LoggerConfig,
  CreateLoggerOptions,
  LogLevel,
  Environment,
  LogMeta,
  ErrorDashboardLogEntry,
} from './logger-types';

// Удобные функции для создания логгеров
export {
  createWebLogger,
  createTrainerPanelLogger,
  createErrorDashboardLogger,
  createTelegramBotLogger,
  createWorkerLogger,
  createBullBoardLogger,
  createAdminPanelLogger,
  createSilentLogger,
} from './LoggerFactory';

// Переэкспорт Pino для расширенного использования
export { pino } from 'pino';
export type { Logger as PinoLogger } from 'pino';
