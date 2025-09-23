/**
 * ------------------------------------------------------------
 * Создаём единое подключение ioredis для BullMQ v5.
 * Важно:  maxRetriesPerRequest = null  и  enableReadyCheck = false
 *         позволяют BullMQ выполнять BLPOP/BRPOP без повторных попыток.
 */
import { Redis } from "ioredis";

/**
 * REDIS_URL должен быть задан в .env, например:
 * REDIS_URL=redis://localhost:6379
 */
if (!process.env.REDIS_URL) {
  console.error("❌ REDIS_URL is not set in environment variables");
  console.error("Available environment variables:", Object.keys(process.env).filter(key => key.includes('REDIS')));
  throw new Error("REDIS_URL is not set in environment variables");
}

export const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // требование BullMQ
  enableReadyCheck: false, // ускоряет подключение
});

export default connection;
