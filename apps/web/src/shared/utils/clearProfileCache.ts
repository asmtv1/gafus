"use client";

import { createWebLogger } from "@gafus/logger";

const HTML_CACHE_NAME = "gafus-html-v4";
const API_CACHE_NAME = "gafus-api-v4";
const RSC_CACHE_NAME = "gafus-rsc-v4";

const logger = createWebLogger("web-clear-profile-cache");

interface ClearProfileCacheResult {
  success: boolean;
  removed?: number;
}

export async function clearProfilePageCache(username?: string | null): Promise<void> {
  if (typeof window === "undefined") return;

  const normalizedUsername =
    typeof username === "string" && username.length > 0 ? username : undefined;

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    try {
      const result = await sendMessageToServiceWorker(normalizedUsername ?? null);
      if (result.success) {
        logger.info("Профильный кэш очищен через Service Worker", {
          removed: result.removed ?? 0,
          operation: "clear_profile_cache_sw",
        });
        return;
      }
    } catch (error) {
      logger.warn("Не удалось очистить кэш профиля через Service Worker", {
        error,
        operation: "warn",
      });
    }
  }

  if ("caches" in window) {
    try {
      const removed = await clearCachesDirectly(normalizedUsername ?? null);
      logger.info("Профильный кэш очищен напрямую через Cache API", {
        removed,
        operation: "clear_profile_cache_cache_api",
      });
    } catch (error) {
      logger.warn("Не удалось очистить кэш профиля через Cache API", {
        error,
        operation: "warn",
      });
    }
  }
}

async function sendMessageToServiceWorker(username: string | null): Promise<ClearProfileCacheResult> {
  return new Promise((resolve, reject) => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      reject(new Error("Service Worker controller is not available"));
      return;
    }

    const channel = new MessageChannel();
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Service Worker response timeout"));
    }, 4000);

    channel.port1.onmessage = (event: MessageEvent<ClearProfileCacheResult & { type?: string }>) => {
      const data = event.data;
      if (!data) return;
      // Проверяем тип сообщения для безопасности
      if (data.type && data.type !== "CLEAR_PROFILE_CACHE_RESULT") return;
      if (data.success) {
        window.clearTimeout(timeoutId);
        resolve(data);
      } else {
        window.clearTimeout(timeoutId);
        reject(new Error("Service Worker reported failure"));
      }
    };

    try {
      controller.postMessage(
        {
          type: "CLEAR_PROFILE_CACHE",
          username,
        },
        [channel.port2],
      );
    } catch (error) {
      window.clearTimeout(timeoutId);
      reject(error instanceof Error ? error : new Error("Unknown error"));
    }
  });
}

async function clearCachesDirectly(username: string | null): Promise<number> {
  const cacheNames = [HTML_CACHE_NAME, API_CACHE_NAME, RSC_CACHE_NAME];
  let removed = 0;
  const normalizedUsername = username ? username.toLowerCase() : null;

  for (const cacheName of cacheNames) {
    try {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        try {
          const url = new URL(request.url);
          if (!url.pathname.startsWith("/profile")) continue;

          // Проверяем username для фильтрации
          if (normalizedUsername) {
            const param = url.searchParams.get("username");
            if (!param || param.toLowerCase() !== normalizedUsername) continue;
          }

          // Для HTML кэша проверяем оба варианта ключа (с __sw_html и без)
          const isHTMLCache = cacheName === HTML_CACHE_NAME;
          const hasHTMLParam = url.searchParams.has("__sw_html");
          
          if (isHTMLCache) {
            // Если это HTML кэш и нет параметра __sw_html, создаем ключ с параметром и удаляем оба
            if (!hasHTMLParam) {
              const urlWithHTMLParam = new URL(url.toString());
              urlWithHTMLParam.searchParams.set("__sw_html", "1");
              const requestWithHTMLParam = new Request(urlWithHTMLParam.toString(), { method: "GET" });
              const deletedWithParam = await cache.delete(requestWithHTMLParam);
              const deletedOriginal = await cache.delete(request);
              if (deletedWithParam || deletedOriginal) removed += 1;
            } else {
              // Если уже есть параметр, удаляем только этот запрос
              const deleted = await cache.delete(request);
              if (deleted) removed += 1;
            }
          } else {
            // Для не-HTML кэшей удаляем запрос как обычно
            const deleted = await cache.delete(request);
            if (deleted) removed += 1;
          }
        } catch (error) {
          logger.warn("Ошибка обработки записи кэша", {
            cacheName,
            url: request.url,
            error,
            operation: "warn",
          });
        }
      }
    } catch (error) {
      logger.warn("Ошибка очистки кеша профиля", {
        cacheName,
        error,
        operation: "warn",
      });
    }
  }

  return removed;
}


