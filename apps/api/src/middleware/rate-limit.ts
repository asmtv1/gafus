/**
 * Rate Limiting Middleware
 * Защита от brute force и DoS атак
 */
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { RedisStore } from "@hono-rate-limiter/redis";
import { connection as ioredisClient } from "@gafus/queues";

/**
 * Адаптер для ioredis клиента, чтобы он соответствовал интерфейсу RedisClient
 * из @hono-rate-limiter/redis
 */
const redisClientAdapter = {
  async scriptLoad(script: string): Promise<string> {
    const result = await ioredisClient.script("LOAD", script);
    if (typeof result !== "string") {
      throw new Error("scriptLoad returned non-string value");
    }
    return result;
  },
  async evalsha<T = unknown>(sha1: string, keys: string[], args: unknown[]): Promise<T> {
    // ioredis.evalsha принимает: sha, numkeys, ...keys, ...args
    // args должны быть совместимы с RedisValue (string | number | Buffer)
    const redisArgs = args.map((arg) => {
      if (typeof arg === "string" || typeof arg === "number") {
        return arg;
      }
      return String(arg);
    });
    return ioredisClient.evalsha(sha1, keys.length, ...keys, ...redisArgs) as Promise<T>;
  },
  async decr(key: string): Promise<number> {
    return ioredisClient.decr(key);
  },
  async del(key: string): Promise<number> {
    return ioredisClient.del(key);
  },
};

const store = new RedisStore({
  client: redisClientAdapter,
  prefix: "gafus-api-rate:",
});

/**
 * Извлекает IP адрес клиента с учётом прокси
 */
function getClientIp(c: Context): string {
  // Cloudflare
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp;

  // X-Forwarded-For (первый IP — клиент)
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  // X-Real-IP (nginx)
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp;

  // Fallback — не идеально, но лучше чем "unknown" для всех
  return "unknown-" + Date.now();
}

/**
 * Строгий лимит для auth endpoints (защита от brute force)
 * 10 попыток за 15 минут
 */
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 минут
  limit: 10, // 10 попыток
  standardHeaders: "draft-6",
  keyGenerator: (c) => `auth:${getClientIp(c)}`,
  store,
});

/**
 * Стандартный лимит для остальных endpoints
 * 100 запросов в минуту
 */
export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 минута
  limit: 100, // 100 запросов
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const user = c.get("user");
    if (user) return `user:${user.id}`;
    return `ip:${getClientIp(c)}`;
  },
  store,
});
