"use client";

import { createWebLogger } from "@gafus/logger";
import type { OfflineCourse } from "./types";

const logger = createWebLogger("web-html-page-storage");

const DB_NAME = "gafus-offline-courses";
const DB_VERSION = 1;
const STORE_NAME = "courses";
const OFFLINE_CACHE_NAME = "gafus-offline-v1";

/**
 * Извлекает chunks из HTML и кэширует их через Cache API
 */
async function cacheChunksFromHtml(html: string, pageUrl: string): Promise<void> {
  try {
    const baseUrl = new URL(pageUrl, window.location.origin).origin;
    const chunksToCache = new Set<string>();

    // Ищем все script теги с chunks
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith("/_next/static/")) {
        const fullUrl = url.startsWith("http") ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }

    // Ищем все link теги с CSS chunks
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith("/_next/static/")) {
        const fullUrl = url.startsWith("http") ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }

    // Ищем chunks в __NEXT_DATA__
    const nextDataMatch = html.match(
      /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([^<]+)<\/script>/i,
    );
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const baseUrlObj = new URL(pageUrl, window.location.origin);

        // Извлекаем chunks из разных мест в __NEXT_DATA__
        // Next.js хранит chunks в pageProps, buildId и других местах
        if (nextData.buildId) {
          // Можно использовать buildId для предсказания путей к chunks
        }

        // Ищем все упоминания /_next/static/ в JSON
        const jsonString = JSON.stringify(nextData);
        const chunkPathRegex = /"\/_next\/static\/[^"]+"/g;
        let chunkMatch;
        while ((chunkMatch = chunkPathRegex.exec(jsonString)) !== null) {
          const chunkPath = chunkMatch[0].replace(/"/g, "");
          const fullUrl = new URL(chunkPath, baseUrlObj.origin).href;
          chunksToCache.add(fullUrl);
        }
      } catch (e) {
        // Игнорируем ошибки парсинга
        logger.warn("Failed to parse __NEXT_DATA__", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (chunksToCache.size === 0) {
      logger.info("No chunks found in HTML", { pageUrl });
      return;
    }

    logger.info("Found chunks to cache", {
      pageUrl,
      chunksCount: chunksToCache.size,
      chunks: Array.from(chunksToCache).slice(0, 5), // Первые 5 для логов
    });

    // Открываем кэш и кэшируем chunks
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const cachePromises = Array.from(chunksToCache).map(async (chunkUrl) => {
      try {
        // Проверяем, не закэширован ли уже
        const cached = await cache.match(chunkUrl);
        if (cached) {
          return; // Уже закэширован
        }

        const response = await fetch(chunkUrl);
        if (response.ok) {
          await cache.put(chunkUrl, response.clone());
          logger.info("Chunk cached successfully", { chunkUrl });
        } else {
          logger.warn("Failed to cache chunk - non-OK response", {
            chunkUrl,
            status: response.status,
          });
        }
      } catch (error) {
        logger.warn("Failed to cache chunk", {
          chunkUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(cachePromises);

    logger.info("Chunks caching completed", {
      pageUrl,
      totalChunks: chunksToCache.size,
    });
  } catch (error) {
    logger.error("Failed to cache chunks from HTML", error as Error, {
      pageUrl,
    });
  }
}

/**
 * Сохраняет HTML страницы курса в IndexedDB (резервный вариант)
 * Основной способ - Cache API в Service Worker
 */
export async function saveCourseHtmlPage(
  courseType: string,
  pagePath: string,
  html: string,
): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "courseId" });
        }
      };
    });

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("courseType");

    // Получаем курс по типу
    const course = await new Promise<OfflineCourse | undefined>((resolve, reject) => {
      const request = index.get(courseType);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!course) {
      logger.warn("Course not found in IndexedDB for HTML storage", { courseType });
      return;
    }

    // Обновляем курс, добавляя HTML страницы
    if (!course.htmlPages) {
      course.htmlPages = {};
    }

    // Определяем тип страницы и сохраняем
    // Страница дня: /trainings/[courseType]/[dayId]
    const dayMatch = pagePath.match(/^\/trainings\/[^/]+\/([^/]+)$/);
    if (dayMatch) {
      const dayId = dayMatch[1];
      if (!course.htmlPages.dayPages) {
        course.htmlPages.dayPages = {};
      }
      course.htmlPages.dayPages[dayId] = html;
      logger.info("Day page HTML saved to IndexedDB", {
        courseType,
        dayId,
        pagePath,
        htmlLength: html.length,
      });
    } else if (
      pagePath === `/trainings/${courseType}` ||
      pagePath === `/trainings/${courseType}/`
    ) {
      // Страница списка дней: /trainings/[courseType]
      course.htmlPages.listPage = html;
      logger.info("List page HTML saved to IndexedDB", {
        courseType,
        pagePath,
        htmlLength: html.length,
      });
    } else {
      logger.warn("Unknown page path format, not saving", {
        courseType,
        pagePath,
      });
    }

    // Сохраняем обновленный курс
    await new Promise<void>((resolve, reject) => {
      const request = store.put(course);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info("Course HTML page saved to IndexedDB", {
      courseType,
      pagePath,
      hasListPage: !!course.htmlPages.listPage,
      dayPagesCount: course.htmlPages.dayPages ? Object.keys(course.htmlPages.dayPages).length : 0,
    });
  } catch (error) {
    logger.error("Failed to save course HTML page to IndexedDB", error as Error, {
      courseType,
      pagePath,
    });
  }
}

/**
 * Сохраняет HTML страницы курса при скачивании
 * Получает HTML через fetch и сохраняет в IndexedDB
 */
export async function saveCourseHtmlPagesOnDownload(
  courseType: string,
  trainingDays: { id: string }[],
): Promise<void> {
  try {
    let savedListPage = false;
    let savedDayPages = 0;

    // Сохраняем страницу списка дней
    const listPageUrl = `/trainings/${courseType}`;

    try {
      const response = await fetch(listPageUrl, {
        method: "GET",
        headers: {
          Accept: "text/html",
        },
        credentials: "include", // Включаем cookies для авторизации
      });

      if (response.ok) {
        const html = await response.text();

        if (html && html.length > 0) {
          await saveCourseHtmlPage(courseType, listPageUrl, html);
          // Кэшируем chunks из HTML
          await cacheChunksFromHtml(html, listPageUrl);
          savedListPage = true;
          logger.info("Course list page HTML saved", { courseType, url: listPageUrl });
        }
      } else {
        logger.warn("Failed to fetch list page HTML - non-OK response", {
          courseType,
          url: listPageUrl,
          status: response.status,
        });
      }
    } catch (error) {
      logger.warn("Failed to fetch list page HTML", {
        courseType,
        url: listPageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Сохраняем HTML страниц дней
    for (const day of trainingDays) {
      const dayId = day.id;
      const dayPageUrl = `/trainings/${courseType}/${dayId}`;

      logger.info("Attempting to fetch day page HTML", {
        courseType,
        dayId,
        url: dayPageUrl,
      });

      try {
        const response = await fetch(dayPageUrl, {
          method: "GET",
          headers: {
            Accept: "text/html",
          },
          credentials: "include", // Включаем cookies для авторизации
        });

        if (response.ok) {
          const html = await response.text();

          if (html && html.length > 0) {
            await saveCourseHtmlPage(courseType, dayPageUrl, html);
            // Кэшируем chunks из HTML
            await cacheChunksFromHtml(html, dayPageUrl);
            savedDayPages++;
            logger.info("Course day page HTML saved successfully", {
              courseType,
              dayId,
              url: dayPageUrl,
              htmlLength: html.length,
            });
          } else {
            logger.warn("Fetched day page HTML is empty", {
              courseType,
              dayId,
              url: dayPageUrl,
            });
          }
        } else {
          logger.warn("Failed to fetch day page HTML - non-OK response", {
            courseType,
            dayId,
            url: dayPageUrl,
            status: response.status,
            statusText: response.statusText,
          });
        }
      } catch (error) {
        logger.warn("Failed to fetch day page HTML", {
          courseType,
          dayId,
          url: dayPageUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Course HTML pages saved to IndexedDB", {
      courseType,
      daysCount: trainingDays.length,
      savedListPage,
      savedDayPages,
      totalPages: savedDayPages + (savedListPage ? 1 : 0),
    });
  } catch (error) {
    logger.error("Failed to save course HTML pages on download", error as Error, {
      courseType,
    });
  }
}

/**
 * Получает HTML страницы курса из IndexedDB
 */
export async function getCourseHtmlPage(
  courseType: string,
  pagePath: string,
): Promise<string | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("courseType");

    const course = await new Promise<OfflineCourse | undefined>((resolve, reject) => {
      const request = index.get(courseType);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!course || !course.htmlPages) {
      return null;
    }

    // Определяем тип страницы и возвращаем HTML
    // Страница дня: /trainings/[courseType]/[dayId]
    const dayMatch = pagePath.match(/^\/trainings\/[^/]+\/([^/]+)$/);
    if (dayMatch && course.htmlPages.dayPages) {
      const dayId = dayMatch[1];

      const html = course.htmlPages.dayPages[dayId];
      if (html) {
        logger.info("Day page HTML found in IndexedDB", {
          courseType,
          dayId,
          pagePath,
          htmlLength: html.length,
        });
        return html;
      } else {
        logger.warn("Day page HTML not found in IndexedDB", {
          courseType,
          dayId,
          pagePath,
          availableDays: Object.keys(course.htmlPages.dayPages || {}),
        });
      }
    }

    // Страница списка дней: /trainings/[courseType]
    if (pagePath === `/trainings/${courseType}` || pagePath === `/trainings/${courseType}/`) {
      const html = course.htmlPages.listPage;
      if (html) {
        logger.info("List page HTML found in IndexedDB", {
          courseType,
          pagePath,
          htmlLength: html.length,
        });
        return html;
      } else {
        logger.warn("List page HTML not found in IndexedDB", {
          courseType,
          pagePath,
        });
      }
    }

    logger.warn("No HTML found for page path", {
      courseType,
      pagePath,
      hasListPage: !!course.htmlPages.listPage,
      dayPagesCount: course.htmlPages.dayPages ? Object.keys(course.htmlPages.dayPages).length : 0,
      availableDays: course.htmlPages.dayPages ? Object.keys(course.htmlPages.dayPages) : [],
    });

    return null;
  } catch (error) {
    logger.error("Failed to get course HTML page from IndexedDB", error as Error, {
      courseType,
      pagePath,
    });
    return null;
  }
}
