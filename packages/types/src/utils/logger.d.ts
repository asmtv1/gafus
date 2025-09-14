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
export declare function createLogger(context: string): Logger;
/**
 * Логгер-заглушка для тестов или случаев когда логирование не нужно
 */
export declare const silentLogger: Logger;
/**
 * Проверяет, нужно ли логировать на определенном уровне
 */
export declare function shouldLog(level: "debug" | "info" | "warn" | "error"): boolean;
//# sourceMappingURL=logger.d.ts.map