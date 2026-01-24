/**
 * @gafus/logger - Единый логгер для всех приложений Gafus
 *
 * Этот пакет предоставляет единую систему логирования на основе Pino
 * с интеграцией в error-dashboard для централизованного сбора ошибок.
 *
 * Включает:
 * - UnifiedLogger - основной класс логгера
 * - LoggerFactory - фабрика для создания логгеров
 * - ErrorDashboardTransport - отправка логов в Loki
 *
 * Для Prometheus метрик используйте @gafus/error-handling
 */

// Основные классы и интерфейсы
export { UnifiedLogger } from "./UnifiedLogger.js";
export { LoggerFactory } from "./LoggerFactory.js";
export { ErrorDashboardTransport } from "./transports/ErrorDashboardTransport.js";

// Типы и интерфейсы
export type {
  Logger,
  LoggerConfig,
  CreateLoggerOptions,
  LogLevel,
  Environment,
  LogMeta,
  ErrorDashboardLogEntry,
} from "./logger-types.js";

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
} from "./LoggerFactory.js";

// Переэкспорт Pino для расширенного использования
export { pino } from "pino";
export type { Logger as PinoLogger } from "pino";
