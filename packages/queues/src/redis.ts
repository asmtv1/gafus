/**
 * src/lib/redis.ts
 * ------------------------------------------------------------
 * Создаём единое подключение ioredis для BullMQ v5.
 * Важно:  maxRetriesPerRequest = null  и  enableReadyCheck = false
 *         позволяют BullMQ выполнять BLPOP/BRPOP без повторных попыток.
 */

import "dotenv/config";
import { Redis } from "ioredis";

/**
 * REDIS_URL должен быть задан в .env, например:
 * REDIS_URL=redis://localhost:6379
 */
if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not set in .env");
}

export const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // требование BullMQ
  enableReadyCheck: false, // ускоряет подключение
});

export default connection;
