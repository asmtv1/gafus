/**
 * ------------------------------------------------------------
 * Создаём единое подключение ioredis для BullMQ v5.
 * Важно:  maxRetriesPerRequest = null  и  enableReadyCheck = false
 *         позволяют BullMQ выполнять BLPOP/BRPOP без повторных попыток.
 */
import { Redis } from "ioredis";
import { createWorkerLogger } from "@gafus/logger";
// Создаем логгер для queues
const logger = createWorkerLogger('redis-connection');
/**
 * REDIS_URL должен быть задан в .env, например:
 * REDIS_URL=redis://localhost:6379
 */
if (!process.env.REDIS_URL) {
    logger.error("REDIS_URL is not set in environment variables", new Error("Missing REDIS_URL"), {
        availableRedisVars: Object.keys(process.env).filter(key => key.includes('REDIS')),
        environment: process.env.NODE_ENV || 'development'
    });
    throw new Error("REDIS_URL is not set in environment variables");
}
export const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // требование BullMQ
    enableReadyCheck: false, // ускоряет подключение
});
// Обработка событий подключения
connection.on('connect', () => {
    logger.info("Redis connection established", {
        url: process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@'), // Скрываем пароль в логах
        maxRetriesPerRequest: null,
        enableReadyCheck: false
    });
});
connection.on('ready', () => {
    logger.success("Redis connection is ready", {
        url: process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@')
    });
});
connection.on('error', (error) => {
    logger.error("Redis connection error", error, {
        url: process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@'),
        errorCode: error.code,
        errno: error.errno
    });
});
connection.on('close', () => {
    logger.warn("Redis connection closed", {
        url: process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@')
    });
});
connection.on('reconnecting', () => {
    logger.info("Redis reconnecting", {
        url: process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@')
    });
});
export default connection;
