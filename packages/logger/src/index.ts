/**
 * @gafus/logger - Единый логгер для всех приложений Gafus
 *
 * Pino-based logging. Логи → stdout (docker logs). Ошибки → Tracer.
 * Клиентские ошибки — @gafus/error-handling → Tracer.
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
