/**
 * ------------------------------------------------------------
 * Создаём единое подключение ioredis для BullMQ v5.
 * Важно:  maxRetriesPerRequest = null  и  enableReadyCheck = false
 *         позволяют BullMQ выполнять BLPOP/BRPOP без повторных попыток.
 */
import { Redis } from "ioredis";
import { createWorkerLogger } from "@gafus/logger";

// Создаем логгер для queues
const logger = createWorkerLogger("redis-connection");

/**
 * REDIS_URL — из .env (например redis://localhost:6379).
 * Без переменной при импорте используем localhost: не бросаем ошибку, чтобы `next build`
 * не падал при сборке Route Handlers, которые транзитивно тянут очереди (реальный URL
 * в проде и воркерах по-прежнему задаётся через env).
 */
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
if (!process.env.REDIS_URL) {
  logger.warn("REDIS_URL не задан; подключение к redis://127.0.0.1:6379", {
    environment: process.env.NODE_ENV || "development",
  });
}

const maskedRedisUrl = redisUrl.replace(/\/\/.*@/, "//***@");

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // требование BullMQ
  enableReadyCheck: false, // ускоряет подключение
});

// Обработка событий подключения
connection.on("connect", () => {
  logger.info("Redis connection established", {
    url: maskedRedisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
});

connection.on("ready", () => {
  logger.success("Redis connection is ready", {
    url: maskedRedisUrl,
  });
});

connection.on("error", (error) => {
  logger.error("Redis connection error", error, {
    url: maskedRedisUrl,
    errorCode: (error as any).code,
    errno: (error as any).errno,
  });
});

connection.on("close", () => {
  logger.warn("Redis connection closed", {
    url: maskedRedisUrl,
  });
});

connection.on("reconnecting", () => {
  logger.info("Redis reconnecting", {
    url: maskedRedisUrl,
  });
});

export default connection;
