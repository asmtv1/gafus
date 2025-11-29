/**
 * @gafus/logger - Единый логгер для всех приложений Gafus
 * 
 * Этот пакет предоставляет единую систему логирования на основе Pino
 * с интеграцией в error-dashboard для централизованного сбора ошибок.
 * 
 * Включает:
 * - UnifiedLogger - основной класс логгера
 * - ErrorReporter - отправка ошибок в error-dashboard
 * - LoggerFactory - фабрика для создания логгеров
 * 
 * Для Prometheus метрик используйте @gafus/error-handling
 */

// Основные классы и интерфейсы
export { UnifiedLogger } from './UnifiedLogger';
export { LoggerFactory } from './LoggerFactory';
export { ErrorDashboardTransport } from './transports/ErrorDashboardTransport';

// ErrorReporter для отправки ошибок в error-dashboard
export { ErrorReporter } from './ErrorReporter';
export type { ErrorInfo, ErrorReporterConfig } from './ErrorReporter';

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
