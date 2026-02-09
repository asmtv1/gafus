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
};

export type AuthRateLimitPath =
  | "register"
  | "login"
  | "password-reset-request"
  | "reset-password";

const store = new Map<string, number[]>();

function prune(timestamps: number[]): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
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
