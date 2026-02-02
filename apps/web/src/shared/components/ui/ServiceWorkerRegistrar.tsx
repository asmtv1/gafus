"use client";

import serviceWorkerManager from "@shared/utils/serviceWorkerManager";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { createWebLogger } from "@gafus/logger";
import { useEffect } from "react";
import type { OfflineCourse } from "@shared/lib/offline/types";

// Создаем логгер для ServiceWorkerRegistrar
const logger = createWebLogger("web-service-worker-registrar");

// Константы для IndexedDB (дублируем из htmlPageStorage, чтобы не зависеть от внешнего модуля)
const DB_NAME = "gafus-offline-courses";
const DB_VERSION = 1;
const STORE_NAME = "courses";

/**
 * Получает HTML страницы курса из IndexedDB (inline версия для избежания code splitting)
 */
async function getCourseHtmlPageInline(
  courseType: string,
  pagePath: string,
): Promise<string | null> {
  try {
    console.log("[ServiceWorkerRegistrar] Getting HTML from IndexedDB", {
      courseType,
      pagePath,
    });

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
      console.warn("[ServiceWorkerRegistrar] Course or HTML pages not found", {
        courseType,
        pagePath,
        hasCourse: !!course,
        hasHtmlPages: !!course?.htmlPages,
      });
      return null;
    }

    // Определяем тип страницы и возвращаем HTML
    // Страница дня: /trainings/[courseType]/[dayId]
    const dayMatch = pagePath.match(/^\/trainings\/[^/]+\/([^/]+)$/);
    if (dayMatch && course.htmlPages.dayPages) {
      const dayId = dayMatch[1];
      console.log("[ServiceWorkerRegistrar] Looking for day page HTML", {
        courseType,
        dayId,
        pagePath,
        availableDays: Object.keys(course.htmlPages.dayPages),
      });

      const html = course.htmlPages.dayPages[dayId];
      if (html) {
        console.log("[ServiceWorkerRegistrar] Day page HTML found", {
          courseType,
          dayId,
          pagePath,
          htmlLength: html.length,
        });
        return html;
      } else {
        console.warn("[ServiceWorkerRegistrar] Day page HTML not found", {
          courseType,
          dayId,
          pagePath,
          availableDays: Object.keys(course.htmlPages.dayPages),
        });
      }
    }

    // Страница списка дней: /trainings/[courseType]
    if (pagePath === `/trainings/${courseType}` || pagePath === `/trainings/${courseType}/`) {
      const html = course.htmlPages.listPage;
      if (html) {
        console.log("[ServiceWorkerRegistrar] List page HTML found", {
          courseType,
          pagePath,
          htmlLength: html.length,
        });
        return html;
      } else {
        console.warn("[ServiceWorkerRegistrar] List page HTML not found", {
          courseType,
          pagePath,
        });
      }
    }

    console.warn("[ServiceWorkerRegistrar] No HTML found for page", {
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
    console.error("[ServiceWorkerRegistrar] Failed to get HTML", {
      courseType,
      pagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Компонент для регистрации Service Worker и обработки сообщений о сетевом статусе
 */
export default function ServiceWorkerRegistrar() {
  const setOnlineStatus = useOfflineStore((s) => s.setOnlineStatus);

  useEffect(() => {
    // В dev не регистрируем SW — меньше нагрузка, быстрее отклик
    if (process.env.NODE_ENV === "development") return;
    if (serviceWorkerManager.isSupported()) {
      serviceWorkerManager.register().catch((error) => {
        logger.warn("⚠️ Не удалось зарегистрировать Service Worker", {
          operation: "service_worker_registration_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }, []);

  // Обработка сообщений от Service Worker о сетевом статусе и запросах HTML
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      const { data } = event;

      if (data?.type === "NETWORK_STATUS") {
        if (data.status === "OFFLINE") {
          // Игнорируем aborted-ошибки: они часто возникают при HMR/навигации, не означают реальный офлайн
          const errorMessage = data.error || "";
          const isAbortError =
            errorMessage.includes("aborted") ||
            errorMessage.includes("AbortError") ||
            errorMessage.includes("signal is aborted");

          if (isAbortError) {
            logger.info("Service Worker reported aborted request, ignoring", {
              operation: "sw_offline_ignored",
              error: errorMessage,
            });
            return;
          }

          logger.warn("Service Worker detected offline", {
            operation: "sw_offline_detected",
            error: errorMessage,
          });
          setOnlineStatus(false);
        } else if (data.status === "ONLINE") {
          logger.info("Service Worker detected online", {
            operation: "sw_online_detected",
          });
          setOnlineStatus(true);
        }
      }

      // Обработка запроса HTML из IndexedDB
      if (
        data?.type === "NETWORK_STATUS" &&
        data.action === "GET_HTML_FROM_INDEXEDDB" &&
        data.url
      ) {
        try {
          // Нормализуем URL (убираем trailing slash для совместимости с Service Worker)
          const normalizedUrl = data.url.replace(/\/$/, "") || data.url;

          // Извлекаем courseType из URL
          const match = normalizedUrl.match(/^\/trainings\/([^/]+)/);
          if (match) {
            const courseType = match[1];
            console.log("[ServiceWorkerRegistrar] Requesting HTML from IndexedDB", {
              courseType,
              url: normalizedUrl,
            });
            logger.info("Requesting HTML from IndexedDB for Service Worker", {
              courseType,
              url: normalizedUrl,
            });

            const html = await getCourseHtmlPageInline(courseType, normalizedUrl);

            if (html && navigator.serviceWorker.controller) {
              // Отправляем HTML обратно в Service Worker с нормализованным URL
              navigator.serviceWorker.controller.postMessage({
                type: "HTML_FROM_INDEXEDDB",
                url: normalizedUrl,
                html,
              });

              console.log("[ServiceWorkerRegistrar] HTML sent to Service Worker", {
                url: normalizedUrl,
                htmlLength: html.length,
              });
              logger.info("HTML sent to Service Worker from IndexedDB", {
                courseType,
                url: normalizedUrl,
                htmlLength: html.length,
              });
            } else {
              console.warn("[ServiceWorkerRegistrar] HTML not found or SW not available", {
                url: normalizedUrl,
                hasHtml: !!html,
                hasController: !!navigator.serviceWorker.controller,
              });
              logger.warn("HTML not found in IndexedDB or Service Worker not available", {
                courseType,
                url: normalizedUrl,
                hasHtml: !!html,
                hasController: !!navigator.serviceWorker.controller,
              });
            }
          } else {
            console.warn("[ServiceWorkerRegistrar] Failed to extract courseType from URL", {
              url: normalizedUrl,
            });
            logger.warn("Failed to extract courseType from URL", {
              url: normalizedUrl,
            });
          }
        } catch (error) {
          console.error("[ServiceWorkerRegistrar] Error getting HTML from IndexedDB", error);
          logger.error("Failed to get HTML from IndexedDB for Service Worker", error as Error, {
            url: data.url,
          });
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [setOnlineStatus]);

  return null;
}
