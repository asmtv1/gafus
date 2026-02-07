"use client";

import { createWebLogger } from "@gafus/logger";
import { useOfflineStore } from "@shared/stores/offlineStore";

const logger = createWebLogger("web-check-connection");
const PING_TIMEOUT_MS = 3000;

let isCheckingConnection = false;

/**
 * Проверяет реальное подключение к серверу через /api/ping
 */
export async function checkRealConnection(
  timeoutMs = PING_TIMEOUT_MS,
): Promise<boolean> {
  if (isCheckingConnection) return false;
  isCheckingConnection = true;

  try {
    const store = useOfflineStore.getState();
    if (store.activeDownloads > 0) {
      isCheckingConnection = false;
      return true;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch("/api/ping", {
      method: "HEAD",
      cache: "no-cache",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    isCheckingConnection = false;
    return response.ok;
  } catch (error) {
    isCheckingConnection = false;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("aborted") || msg.includes("AbortError")) return false;
    logger.warn("Connection check failed", {
      operation: "connection_check_failed",
      error: msg,
    });
    return false;
  }
}
