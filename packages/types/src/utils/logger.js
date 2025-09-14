// Профессиональный логгер для проекта
/**
 * Создает логгер с контекстом
 * В production режиме отключает debug логи и уменьшает вербозность
 */
export function createLogger(context) {
    const isProduction = process.env.NODE_ENV === "production";
    const isDevelopment = process.env.NODE_ENV === "development";
    const formatMessage = (level, message, meta) => {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${context}] ${level}:`;
        if (meta && Object.keys(meta).length > 0) {
            return `${prefix} ${message} ${JSON.stringify(meta)}`;
        }
        return `${prefix} ${message}`;
    };
    return {
        info: (message, meta) => {
            console.log(formatMessage("INFO", message, meta));
        },
        warn: (message, meta) => {
            console.warn(formatMessage("WARN", message, meta));
        },
        error: (message, meta) => {
            console.error(formatMessage("ERROR", message, meta));
        },
        debug: (message, meta) => {
            // В production не выводим debug логи
            if (!isProduction) {
                console.log(formatMessage("DEBUG", message, meta));
            }
        },
        success: (message, meta) => {
            // В production только записываем в консоль без эмодзи
            if (isProduction) {
                console.log(formatMessage("SUCCESS", message, meta));
            }
            else if (isDevelopment) {
                console.log(formatMessage("✅ SUCCESS", message, meta));
            }
        },
    };
}
/**
 * Логгер-заглушка для тестов или случаев когда логирование не нужно
 */
export const silentLogger = {
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
    success: () => { },
};
/**
 * Проверяет, нужно ли логировать на определенном уровне
 */
export function shouldLog(level) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && level === "debug") {
        return false;
    }
    return true;
}
