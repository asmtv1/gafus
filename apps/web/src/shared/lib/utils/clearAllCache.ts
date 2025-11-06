"use client";

import { createWebLogger } from "@gafus/logger";
import { useQueryClient } from "@gafus/react-query";

const logger = createWebLogger('web-clear-cache');

/**
 * Очищает все кэши приложения:
 * - Zustand stores (courseStore, stepStore, trainingStore, favoritesStore, userStore)
 * - React Query кэш
 * - Service Worker кэш (Cache API)
 * - localStorage для таймеров и других данных
 * 
 * Функция работает полностью офлайн и не требует сетевого подключения.
 * Ошибки в отдельных операциях не блокируют остальные операции.
 */
export async function clearAllCache(): Promise<void> {
  logger.info("🧹 Начинаем очистку всех кэшей", { operation: 'clear_cache_start' });

  const errors: { operation: string; error: unknown }[] = [];

  // 1. Очищаем Zustand stores
  if (typeof window !== "undefined") {
    // courseStore
    try {
      const { useCourseStore } = await import("@shared/stores/courseStore");
      useCourseStore.getState().clearCache();
      logger.info("✅ courseStore очищен", { operation: 'clear_course_store' });
    } catch (error) {
      errors.push({ operation: "courseStore", error });
      logger.warn("⚠️ Ошибка очистки courseStore", { error, operation: 'warn' });
    }

    // stepStore
    try {
      const { useStepStore } = await import("@shared/stores/stepStore");
      useStepStore.setState({ stepStates: {} });
      logger.info("✅ stepStore очищен", { operation: 'clear_step_store' });
    } catch (error) {
      errors.push({ operation: "stepStore", error });
      logger.warn("⚠️ Ошибка очистки stepStore", { error, operation: 'warn' });
    }

    // trainingStore
    try {
      const { useTrainingStore } = await import("@shared/stores/trainingStore");
      useTrainingStore.setState({
        openIndexes: {},
        runningSteps: {},
        courseAssignments: {},
        assignErrors: {},
        cachedTrainingDays: {},
      });
      logger.info("✅ trainingStore очищен", { operation: 'clear_training_store' });
    } catch (error) {
      errors.push({ operation: "trainingStore", error });
      logger.warn("⚠️ Ошибка очистки trainingStore", { error, operation: 'warn' });
    }

    // favoritesStore
    try {
      const { useFavoritesStore } = await import("@shared/stores/favoritesStore");
      useFavoritesStore.setState({
        favoriteIds: new Set<string>(),
        initialized: false,
        loading: false,
        error: null,
      });
      logger.info("✅ favoritesStore очищен", { operation: 'clear_favorites_store' });
    } catch (error) {
      errors.push({ operation: "favoritesStore", error });
      logger.warn("⚠️ Ошибка очистки favoritesStore", { error, operation: 'warn' });
    }

    // userStore - НЕ очищаем полностью, только ошибки (чтобы не удалить авторизацию)
    try {
      const { useUserStore } = await import("@shared/stores/userStore");
      useUserStore.getState().clearError();
      useUserStore.getState().clearProfileError();
      useUserStore.getState().clearPreferencesError();
      logger.info("✅ userStore ошибки очищены", { operation: 'clear_user_store_errors' });
    } catch (error) {
      errors.push({ operation: "userStore", error });
      logger.warn("⚠️ Ошибка очистки userStore", { error, operation: 'warn' });
    }
  }

  // 2. Очищаем React Query кэш
  // React Query кэш очищается через хук useClearAllCache, так как useQueryClient - это хук
  // Здесь очищаем только localStorage ключи React Query, если они есть
  if (typeof window !== "undefined") {
    try {
      const reactQueryKeys = Object.keys(localStorage).filter(key => 
        key.startsWith("REACT_QUERY_OFFLINE_CACHE") || 
        key.startsWith("tanstack") ||
        key.startsWith("@tanstack")
      );
      reactQueryKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          logger.warn(`⚠️ Ошибка удаления ключа ${key}`, { error, operation: 'warn' });
        }
      });
      if (reactQueryKeys.length > 0) {
        logger.info("✅ React Query localStorage очищен", { 
          operation: 'clear_react_query_storage',
          keysCount: reactQueryKeys.length 
        });
      }
    } catch (error) {
      errors.push({ operation: "React Query localStorage", error });
      logger.warn("⚠️ Ошибка очистки React Query localStorage", { error, operation: 'warn' });
    }
  }

  // 3. Очищаем Service Worker кэш
  // Важно: используем таймаут, чтобы избежать зависания при отсутствии сети
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      // Используем Promise.race с таймаутом для предотвращения зависания
      const cacheCleanupPromise = (async () => {
        const cacheNames = await Promise.race([
          caches.keys(),
          new Promise<string[]>((_, reject) => 
            setTimeout(() => reject(new Error("Cache keys timeout")), 5000)
          )
        ]);
        
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith("gafus-")) {
              return Promise.race([
                caches.delete(cacheName),
                new Promise<boolean>((_, reject) => 
                  setTimeout(() => reject(new Error("Cache delete timeout")), 3000)
                )
              ]);
            }
            return Promise.resolve(false);
          })
        );
      })();

      await Promise.race([
        cacheCleanupPromise,
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error("Cache cleanup timeout")), 10000)
        )
      ]);

      logger.info("✅ Service Worker кэш очищен", { operation: 'clear_service_worker' });
    } catch (error) {
      errors.push({ operation: "Service Worker кэш", error });
      // Не считаем это критической ошибкой - кэш SW может быть недоступен в офлайн режиме
      logger.warn("⚠️ Ошибка очистки Service Worker кэша (может быть нормально в офлайн режиме)", { 
        error, 
        operation: 'warn' 
      });
    }
  }

  // 4. Очищаем localStorage для таймеров и других данных
  if (typeof window !== "undefined") {
    try {
      // Очищаем ключи таймеров (training-*-end)
      const timerKeys = Object.keys(localStorage).filter((key) => key.startsWith("training-") && key.endsWith("-end"));
      timerKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          logger.warn(`⚠️ Ошибка удаления ключа таймера ${key}`, { error, operation: 'warn' });
        }
      });

      // Очищаем device-subscriptions
      try {
        localStorage.removeItem("device-subscriptions");
      } catch (error) {
        logger.warn("⚠️ Ошибка удаления device-subscriptions", { error, operation: 'warn' });
      }

      // Устанавливаем флаг для Service Worker, что кэш был очищен
      // Это позволит SW использовать более длительный таймаут при первой загрузке
      try {
        localStorage.setItem("cache-cleared-timestamp", Date.now().toString());
        
        // Сохраняем флаг также в IndexedDB для доступа из Service Worker
        const request = indexedDB.open('sw-localstorage', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('storage')) {
            db.createObjectStore('storage');
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['storage'], 'readwrite');
          const store = transaction.objectStore('storage');
          store.put(Date.now().toString(), 'cache-cleared-timestamp');
          db.close();
          logger.info("✅ Установлен флаг очистки кэша для SW", { operation: 'set_cache_cleared_flag' });
        };
        
        request.onerror = () => {
          logger.warn("⚠️ Ошибка установки флага очистки кэша в IndexedDB", { 
            error: request.error, 
            operation: 'warn' 
          });
        };
      } catch (error) {
        logger.warn("⚠️ Ошибка установки флага очистки кэша", { error, operation: 'warn' });
      }

      logger.info("✅ localStorage очищен", { 
        operation: 'clear_local_storage',
        timerKeysCount: timerKeys.length 
      });
    } catch (error) {
      errors.push({ operation: "localStorage", error });
      logger.warn("⚠️ Ошибка очистки localStorage", { error, operation: 'warn' });
    }
  }

  // Если были критические ошибки, логируем их, но не считаем операцию полностью проваленной
  if (errors.length > 0) {
    logger.warn("⚠️ Некоторые операции очистки завершились с ошибками, но основные кэши очищены", {
      errorsCount: errors.length,
      operations: errors.map(e => e.operation),
      operation: 'warn'
    });
  }

  logger.success("✅ Очистка кэшей завершена", { 
    operation: 'clear_cache_success',
    errorsCount: errors.length 
  });
}

/**
 * Хук для очистки кэша с доступом к React Query Client
 */
export function useClearAllCache() {
  const queryClient = useQueryClient();

  const clearCache = async () => {
    logger.info("🧹 Начинаем очистку всех кэшей через хук", { operation: 'clear_cache_hook_start' });

    try {
      // Очищаем React Query кэш через хук
      queryClient.clear();
      logger.info("✅ React Query кэш очищен", { operation: 'clear_react_query_cache' });
    } catch (error) {
      // Не критично если React Query кэш не очистился
      logger.warn("⚠️ Ошибка очистки React Query кэша", { error, operation: 'warn' });
    }

    try {
      // Вызываем остальную очистку
      await clearAllCache();
      logger.success("✅ Все кэши успешно очищены через хук", { operation: 'clear_cache_hook_success' });
    } catch (error) {
      // Функция clearAllCache теперь не бросает ошибки, но на всякий случай обрабатываем
      logger.warn("⚠️ Произошли некоторые ошибки при очистке кэшей", { error, operation: 'warn' });
      // Не пробрасываем ошибку дальше - очистка локальных кэшей всегда успешна
    }
  };

  return { clearCache };
}

