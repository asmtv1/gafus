/**
 * @gafus/logger - Единый логгер для всех приложений Gafus
 *
 * Pino-based logging. Серверные логи → stdout → Vector → Seq.
 * Клиентские ошибки — в Tracer через @gafus/error-handling.
 */

export { UnifiedLogger } from "./UnifiedLogger.js";
export { LoggerFactory } from "./LoggerFactory.js";
export type {
  Logger,
  LoggerConfig,
  CreateLoggerOptions,
  LogLevel,
  Environment,
  LogMeta,
} from "./logger-types.js";
export {
  createWebLogger,
  createTrainerPanelLogger,
  createTelegramBotLogger,
  createWorkerLogger,
  createBullBoardLogger,
  createAdminPanelLogger,
  createSilentLogger,
} from "./LoggerFactory.js";

// Переэкспорт Pino для расширенного использования
export { pino } from "pino";
export type { Logger as PinoLogger } from "pino";
