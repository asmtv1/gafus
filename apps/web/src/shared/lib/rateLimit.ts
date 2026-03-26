/**
 * Rate limit по IP для auth-эндпоинтов.
 * In-memory хранилище: при нескольких инстансах счётчики не общие (документировать).
 */

import type { NextRequest } from "next/server";
import { headers } from "next/headers";

const WINDOW_MS = 15 * 60 * 1000; // 15 мин

const LIMITS: Record<AuthRateLimitPath, number> = {
  register: 5,
  login: 10,
  "password-reset-request": 5,
  "reset-password": 10,
  "email-change-request": 5,
  "email-change-confirm": 10,
  "username-change": 10,
  "set-password": 5,
  "change-password": 10,
  "vk-phone-set": 5,
  "vk-id-callback": 5,
  "initiate-vk-id": 10,
  "vk-id-link": 10,
  "username-available": 30,
  "account-deletion-code": 5,
  "account-deletion-submit": 10,
};

export type AuthRateLimitPath =
  | "register"
  | "login"
  | "password-reset-request"
  | "reset-password"
  | "email-change-request"
  | "email-change-confirm"
  | "username-change"
  | "set-password"
  | "change-password"
  | "vk-phone-set"
  | "vk-id-callback"
  | "initiate-vk-id"
  | "vk-id-link"
  | "username-available"
  | "account-deletion-code"
  | "account-deletion-submit";

const store = new Map<string, number[]>();

function prune(timestamps: number[]): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

function isDevOrLocalhost(ip: string): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].includes(ip);
}

/**
 * IP из request (API routes).
 */
export function getClientIp(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  return raw || "unknown";
}

/**
 * IP из заголовков (Server Actions). Next.js 15: headers() — async.
 */
export async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  return raw || "unknown";
}

/**
 * Проверяет лимит. При превышении возвращает false.
 * При разрешённом запросе учитывает текущий запрос (инкремент).
 */
export function checkAuthRateLimit(ip: string, path: AuthRateLimitPath): boolean {
  if (isDevOrLocalhost(ip)) return true;

  const key = `${ip}:${path}`;
  const max = LIMITS[path];
  let timestamps = store.get(key) ?? [];
  timestamps = prune(timestamps);

  if (timestamps.length >= max) {
    return false;
  }

  timestamps.push(Date.now());
  store.set(key, timestamps);
  return true;
}

export const RATE_LIMIT_RETRY_AFTER_SECONDS = 900;
