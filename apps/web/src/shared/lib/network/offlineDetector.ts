"use client";

import { createWebLogger } from "@gafus/logger";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { isCourseDownloadedByType } from "@shared/lib/offline/offlineCourseStorage";

const logger = createWebLogger("web-offline-detector");

const STORAGE_KEY = "offline_previous_url";
const PING_INTERVAL = 8000; // 8 секунд
const PING_TIMEOUT = 3000; // 3 секунды
const OFFLINE_PAGE = "/~offline";

let pingIntervalId: NodeJS.Timeout | null = null;
let isInitialized = false;
let isCheckingConnection = false;

/**
 * Проверяет реальное подключение к серверу через /api/ping
 */
async function checkRealConnection(): Promise<boolean> {
  if (isCheckingConnection) {
    return false;
  }

  isCheckingConnection = true;

  try {
    const store = useOfflineStore.getState();
    if (store.activeDownloads > 0) {
      return true;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT);

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
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Игнорируем ошибки отмены запроса (AbortError)
    if (errorMessage.includes("aborted") || errorMessage.includes("AbortError")) {
      return false;
    }

    logger.warn("Connection check failed", {
      operation: "connection_check_failed",
      error: errorMessage,
    });
    return false;
  }
}

/**
 * Сохраняет текущий URL перед редиректом на страницу офлайна
 */
function saveCurrentUrl(): void {
  if (typeof window === "undefined") return;

  const currentPath = window.location.pathname;

  // Не сохраняем URL если уже на странице офлайна или это статический ресурс
  if (
    currentPath === OFFLINE_PAGE ||
    currentPath.startsWith("/_next/") ||
    currentPath.startsWith("/api/")
  ) {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, currentPath);
    logger.info("Saved previous URL before offline redirect", {
      operation: "save_previous_url",
      url: currentPath,
    });
  } catch (error) {
    logger.warn("Failed to save previous URL", {
      operation: "save_previous_url_error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Редиректит с офлайн страницы на страницу курсов при восстановлении соединения
 * Редирект происходит только если пользователь все еще на странице офлайна
 */
function restorePreviousUrl(): void {
  if (typeof window === "undefined") return;

  try {
    const currentPath = window.location.pathname;

    // Редиректим только если мы на странице офлайна
    if (currentPath !== OFFLINE_PAGE) {
      // Очищаем сохраненный URL если есть (для совместимости)
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Игнорируем ошибки
      }
      return;
    }

    logger.info("Redirecting from offline page to /courses", {
      operation: "restore_previous_url",
    });

    // Очищаем сохраненный URL (для совместимости)
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Игнорируем ошибки
    }

    // Всегда редиректим на /courses
    setTimeout(() => {
      try {
        if (window.location.pathname === OFFLINE_PAGE) {
          window.location.replace("/courses");
        }
      } catch (error) {
        logger.error("Failed to execute redirect", error as Error, {
          operation: "restore_previous_url_execute_error",
        });
        // Fallback
        try {
          if (window.location.pathname === OFFLINE_PAGE) {
            window.location.href = "/courses";
          }
        } catch (fallbackError) {
          logger.error("Fallback redirect also failed", fallbackError as Error);
        }
      }
    }, 100);
  } catch (error) {
    logger.error("Failed to restore previous URL", error as Error);
    // Fallback на /courses
    try {
      if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
        setTimeout(() => {
          if (window.location.pathname === OFFLINE_PAGE) {
            window.location.replace("/courses");
          }
        }, 100);
      }
    } catch (fallbackError) {
      logger.error("Fallback redirect failed", fallbackError as Error);
    }
  }
}

/**
 * Проверяет, нужно ли делать редирект на страницу офлайна
 * Проверяет, не находится ли пользователь на странице шага скачанного курса
 */
async function shouldRedirectToOffline(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const store = useOfflineStore.getState();
  if (store.activeDownloads > 0) {
    logger.info("Skipping offline redirect during active downloads", {
      operation: "skip_redirect_active_downloads",
      activeDownloads: store.activeDownloads,
    });
    return false;
  }

  const currentPath = window.location.pathname;

  // Не редиректим если уже на странице офлайна
  if (currentPath === OFFLINE_PAGE) {
    return false;
  }

  // Не редиректим для статических ресурсов и API
  if (
    currentPath.startsWith("/_next/") ||
    currentPath.startsWith("/api/") ||
    currentPath.includes(".")
  ) {
    return false;
  }

  // Проверяем, не находимся ли мы на странице скачанного курса
  // URL паттерны: /trainings/[courseType] (список дней) или /trainings/[courseType]/[dayId] (страница дня)
  const trainingDayMatch = currentPath.match(/^\/trainings\/([^/]+)\/([^/]+)$/);
  const trainingListMatch = currentPath.match(/^\/trainings\/([^/]+)$/);

  const courseType = trainingDayMatch?.[1] || trainingListMatch?.[1];

  if (courseType) {
    try {
      const isDownloaded = await isCourseDownloadedByType(courseType);
      if (isDownloaded) {
        logger.info("Skipping redirect - user is on downloaded course page", {
          operation: "skip_redirect_downloaded_course",
          courseType,
          path: currentPath,
          isDayPage: !!trainingDayMatch,
          isListPage: !!trainingListMatch,
        });
        return false;
      }
    } catch (error) {
      // В случае ошибки проверки продолжаем с обычной логикой
      logger.warn("Failed to check if course is downloaded", {
        operation: "check_downloaded_course_error",
        courseType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return true;
}

/**
 * Выполняет редирект на страницу офлайна
 * Проверяет, не находится ли пользователь на странице шага скачанного курса
 */
async function redirectToOffline(): Promise<void> {
  const shouldRedirect = await shouldRedirectToOffline();
  if (!shouldRedirect) {
    return;
  }

  // Сохранение URL больше не нужно - при восстановлении соединения
  // всегда редиректим на /courses, а не на сохраненный URL

  logger.info("Redirecting to offline page", {
    operation: "redirect_to_offline",
  });

  // Используем replace чтобы не добавлять в историю
  window.location.replace(OFFLINE_PAGE);
}

/**
 * Обработчик события offline браузера
 */
function handleOfflineEvent(): void {
  logger.warn("Browser offline event detected", {
    operation: "browser_offline_event",
  });

  const store = useOfflineStore.getState();
  store.setOnlineStatus(false);

  // Немедленно делаем редирект при событии offline
  // Это предотвращает показ встроенной страницы ошибки браузера
  // Проверяем асинхронно, не находимся ли мы на странице скачанного курса
  shouldRedirectToOffline().then((shouldRedirect) => {
    if (shouldRedirect) {
      redirectToOffline();
    }
  });

  // Параллельно проверяем реальное подключение для корректности статуса
  // (но редирект уже выполнен)
  checkRealConnection()
    .then((isOnline) => {
      if (isOnline) {
        // Если navigator.onLine говорит офлайн, но ping успешен - обновляем статус
        // и возвращаемся на предыдущую страницу
        store.setOnlineStatus(true);
        if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
          restorePreviousUrl();
        }
      }
    })
    .catch(() => {
      // В случае ошибки проверки оставляем статус офлайн
    });
}

/**
 * Обработчик события online браузера
 */
function handleOnlineEvent(): void {
  logger.info("Browser online event detected", {
    operation: "browser_online_event",
  });

  // Проверяем реальное подключение
  checkRealConnection()
    .then((isOnline) => {
      const store = useOfflineStore.getState();
      store.setOnlineStatus(isOnline);

      if (isOnline) {
        // Если мы на странице офлайна и подключение восстановлено - возвращаемся
        // Добавляем небольшую задержку для надежности
        if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
          logger.info("Online detected, will restore previous URL", {
            operation: "handle_online_event_restore",
          });
          // Небольшая задержка перед редиректом для надежности
          setTimeout(() => {
            if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
              restorePreviousUrl();
            }
          }, 300);
        }
      }
    })
    .catch(() => {
      // В случае ошибки проверки оставляем статус как есть
      logger.warn("Failed to verify connection after online event", {
        operation: "verify_connection_after_online_failed",
      });
    });
}

/**
 * Периодическая проверка подключения
 */
function startPeriodicCheck(): void {
  if (pingIntervalId) {
    return;
  }

  pingIntervalId = setInterval(async () => {
    // Пропускаем проверку если уже на странице офлайна
    if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
      return;
    }

    // Проверяем только если navigator.onLine говорит что онлайн
    // (чтобы не тратить ресурсы когда точно офлайн)
    if (!navigator.onLine) {
      return;
    }

    const isOnline = await checkRealConnection();
    const store = useOfflineStore.getState();

    if (store.activeDownloads > 0) {
      return;
    }

    if (!isOnline && store.isOnline) {
      // Если ping не прошел, но статус был онлайн - переводим в офлайн
      logger.warn("Periodic check detected offline", {
        operation: "periodic_check_offline",
      });
      store.setOnlineStatus(false);
      // Проверяем асинхронно, не находимся ли мы на странице скачанного курса
      redirectToOffline();
    } else if (isOnline && !store.isOnline) {
      // Если ping прошел, но статус был офлайн - переводим в онлайн
      logger.info("Periodic check detected online", {
        operation: "periodic_check_online",
      });
      store.setOnlineStatus(true);

      // Если мы на странице офлайна - возвращаемся
      // Добавляем небольшую задержку для надежности
      if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
        logger.info("Periodic check: online detected, will restore previous URL", {
          operation: "periodic_check_online_restore",
        });
        setTimeout(() => {
          if (typeof window !== "undefined" && window.location.pathname === OFFLINE_PAGE) {
            restorePreviousUrl();
          }
        }, 300);
      }
    }
  }, PING_INTERVAL);

  logger.info("Started periodic connection check", {
    operation: "start_periodic_check",
    interval: PING_INTERVAL,
  });
}

/**
 * Останавливает периодическую проверку
 */
function stopPeriodicCheck(): void {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
    logger.info("Stopped periodic connection check", {
      operation: "stop_periodic_check",
    });
  }
}

/**
 * Инициализирует детектор офлайна
 */
export function initializeOfflineDetector(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (isInitialized) {
    logger.warn("Offline detector already initialized", {
      operation: "detector_already_initialized",
    });
    return;
  }

  // Инициализируем статус на основе navigator.onLine
  const initialOnline = navigator.onLine;
  const store = useOfflineStore.getState();

  if (store.isOnline !== initialOnline) {
    store.setOnlineStatus(initialOnline);
  }

  if (initialOnline && window.location.pathname === OFFLINE_PAGE) {
    restorePreviousUrl();
  }

  // Если изначально офлайн - немедленно делаем редирект
  // Это предотвращает показ встроенной страницы ошибки браузера
  if (!initialOnline) {
    // Проверяем асинхронно, не находимся ли мы на странице скачанного курса
    shouldRedirectToOffline().then((shouldRedirect) => {
      if (shouldRedirect) {
        redirectToOffline();
      }
    });

    // Параллельно проверяем реальное подключение для корректности статуса
    checkRealConnection()
      .then((isOnline) => {
        store.setOnlineStatus(isOnline);
        // Если подключение есть, возвращаемся на предыдущую страницу
        if (
          isOnline &&
          typeof window !== "undefined" &&
          window.location.pathname === OFFLINE_PAGE
        ) {
          restorePreviousUrl();
        }
      })
      .catch(() => {
        // В случае ошибки проверки оставляем статус офлайн
      });
  }

  // Добавляем слушатели событий браузера
  window.addEventListener("online", handleOnlineEvent);
  window.addEventListener("offline", handleOfflineEvent);

  // Запускаем периодическую проверку
  startPeriodicCheck();

  isInitialized = true;

  logger.info("Offline detector initialized", {
    operation: "detector_initialized",
    initialOnline,
  });
}

/**
 * Очищает детектор офлайна
 */
export function cleanupOfflineDetector(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!isInitialized) {
    return;
  }

  // Удаляем слушатели событий
  window.removeEventListener("online", handleOnlineEvent);
  window.removeEventListener("offline", handleOfflineEvent);

  // Останавливаем периодическую проверку
  stopPeriodicCheck();

  isInitialized = false;

  logger.info("Offline detector cleaned up", {
    operation: "detector_cleanup",
  });
}
