import { type Logger, type LogMeta } from "@gafus/logger";
export type { LogMeta, Logger };
/**
 * Создает логгер с контекстом
 * Автоматически определяет тип приложения по контексту
 * В production режиме отправляет ошибки в error-dashboard
 */
export declare function createLogger(context: string): Logger;
/**
 * Логгер-заглушка для тестов или случаев когда логирование не нужно
 * Теперь использует silent логгер из @gafus/logger
 */
export declare const silentLogger: Logger;
/**
 * Проверяет, нужно ли логировать на определенном уровне
 * Теперь использует логику из @gafus/logger
 */
export declare function shouldLog(level: "debug" | "info" | "warn" | "error"): boolean;
//# sourceMappingURL=logger.d.ts.map
