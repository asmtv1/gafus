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
 */
export async function clearAllCache(): Promise<void> {
  try {
    logger.info("🧹 Начинаем очистку всех кэшей", { operation: 'clear_cache_start' });

    // 1. Очищаем Zustand stores
    if (typeof window !== "undefined") {
      // courseStore
      try {
        const { useCourseStore } = await import("@shared/stores/courseStore");
        useCourseStore.getState().clearCache();
        logger.info("✅ courseStore очищен", { operation: 'clear_course_store' });
      } catch (error) {
        logger.warn("⚠️ Ошибка очистки courseStore", { error, operation: 'warn' });
      }

      // stepStore
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        useStepStore.setState({ stepStates: {} });
        logger.info("✅ stepStore очищен", { operation: 'clear_step_store' });
      } catch (error) {
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
        reactQueryKeys.forEach(key => localStorage.removeItem(key));
        if (reactQueryKeys.length > 0) {
          logger.info("✅ React Query localStorage очищен", { 
            operation: 'clear_react_query_storage',
            keysCount: reactQueryKeys.length 
          });
        }
      } catch (error) {
        logger.warn("⚠️ Ошибка очистки React Query localStorage", { error, operation: 'warn' });
      }
    }

    // 3. Очищаем Service Worker кэш
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith("gafus-")) {
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        );
        logger.info("✅ Service Worker кэш очищен", { operation: 'clear_service_worker' });
      } catch (error) {
        logger.warn("⚠️ Ошибка очистки Service Worker кэша", { error, operation: 'warn' });
      }
    }

    // 4. Очищаем localStorage для таймеров и других данных
    if (typeof window !== "undefined") {
      try {
        // Очищаем ключи таймеров (training-*-end)
        const timerKeys = Object.keys(localStorage).filter((key) => key.startsWith("training-") && key.endsWith("-end"));
        timerKeys.forEach((key) => localStorage.removeItem(key));

        // Очищаем device-subscriptions
        localStorage.removeItem("device-subscriptions");

        logger.info("✅ localStorage очищен", { 
          operation: 'clear_local_storage',
          timerKeysCount: timerKeys.length 
        });
      } catch (error) {
        logger.warn("⚠️ Ошибка очистки localStorage", { error, operation: 'warn' });
      }
    }

    logger.success("✅ Все кэши успешно очищены", { operation: 'clear_cache_success' });
  } catch (error) {
    logger.error("❌ Ошибка при очистке кэшей", error as Error, { operation: 'clear_cache_error' });
    throw error;
  }
}

/**
 * Хук для очистки кэша с доступом к React Query Client
 */
export function useClearAllCache() {
  const queryClient = useQueryClient();

  const clearCache = async () => {
    try {
      logger.info("🧹 Начинаем очистку всех кэшей через хук", { operation: 'clear_cache_hook_start' });

      // Очищаем React Query кэш через хук
      queryClient.clear();

      // Вызываем остальную очистку
      await clearAllCache();

      logger.success("✅ Все кэши успешно очищены через хук", { operation: 'clear_cache_hook_success' });
    } catch (error) {
      logger.error("❌ Ошибка при очистке кэшей через хук", error as Error, { operation: 'clear_cache_hook_error' });
      throw error;
    }
  };

  return { clearCache };
}

