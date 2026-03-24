"use client";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import { useOfflineStore } from "@shared/stores/offlineStore";

const logger = createWebLogger("web-check-connection");

const PING_TIMEOUT_MS = 2500;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

let isCheckingConnection = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Один HEAD-запрос к /api/ping с индивидуальным таймаутом.
 * Возвращает true только при HTTP 2xx.
 */
async function singlePing(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  /* eslint-disable @gafus/require-client-catch-tracer -- ping: ожидаемые сетевые сбои, не спамим Tracer */
  try {
    const response = await fetch("/api/ping", {
      method: "HEAD",
      cache: "no-cache",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

/**
 * Проверяет реальное подключение к серверу через /api/ping.
 * При неудаче повторяет с экспоненциальным backoff + jitter.
 * Офлайн фиксируется только если все попытки провалились.
 */
export async function checkRealConnection(
  timeoutMs = PING_TIMEOUT_MS,
): Promise<boolean> {
  if (isCheckingConnection) return false;
  isCheckingConnection = true;

  try {
    const store = useOfflineStore.getState();
    if (store.activeDownloads > 0) {
      return true;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Экспоненциальный backoff: 500ms, 1000ms + jitter до 200ms
        const backoff = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        const jitter = Math.random() * 200;
        await sleep(backoff + jitter);
      }

      const ok = await singlePing(timeoutMs);

      if (ok) return true;

      logger.warn("Ping attempt failed", {
        operation: "connection_check_attempt_failed",
        attempt: attempt + 1,
        maxAttempts: MAX_RETRIES + 1,
      });
    }

    logger.warn("All ping attempts failed — connection offline", {
      operation: "connection_check_all_failed",
    });
    reportClientError(new Error("connection_check_all_failed"), {
      issueKey: "checkRealConnection",
      severity: "warning",
      keys: { operation: "all_ping_attempts_failed" },
    });
    return false;
  } finally {
    isCheckingConnection = false;
  }
}
