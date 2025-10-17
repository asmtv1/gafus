/**
 * ------------------------------------------------------------
 * Создаём единое подключение ioredis для BullMQ v5.
 * Важно:  maxRetriesPerRequest = null  и  enableReadyCheck = false
 *         позволяют BullMQ выполнять BLPOP/BRPOP без повторных попыток.
 */
import { Redis } from "ioredis";
export declare const connection: Redis;
export default connection;
//# sourceMappingURL=redis.d.ts.map