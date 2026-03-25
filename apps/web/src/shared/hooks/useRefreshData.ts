import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";
import { useQueryClient } from "@gafus/react-query";
import { useCallback } from "react";

import { useCourseStoreActions } from "@shared/stores/courseStore";
import { isOnline } from "@shared/utils/offlineCacheUtils";

// Создаем логгер для useRefreshData
const logger = createWebLogger("web-refresh-data");

// Типы для разных страниц
export type RefreshPageType = "home" | "courses" | "trainings" | "profile" | "achievements";

// Конфигурация обновления для разных страниц
const refreshConfigs = {
  home: {
    endpoints: ["/api/courses", "/api/statistics", "/api/user/progress"],
    message: "Обновляем главную страницу...",
  },
  courses: {
    endpoints: ["/api/courses", "/api/user/courses"],
    message: "Обновляем список курсов...",
  },
  trainings: {
    endpoints: ["/api/trainings", "/api/user/progress"],
    message: "Обновляем тренировки...",
  },
  profile: {
    endpoints: ["/api/user/profile", "/api/user/pets"],
    message: "Обновляем профиль...",
  },
  achievements: {
    endpoints: ["/api/user/achievements", "/api/user/profile", "/api/courses"],
    message: "Обновляем достижения...",
  },
};

export function useRefreshData(pageType: RefreshPageType) {
  const queryClient = useQueryClient();
  const { fetchAllCourses, fetchFavorites, fetchAuthored } = useCourseStoreActions();

  const refreshData = useCallback(async () => {
    const config = refreshConfigs[pageType];

    if (!config) {
      throw new Error(`Неизвестный тип страницы: ${pageType}`);
    }

    logger.warn(`🔄 ${config.message}`, { operation: "warn" });

    // Если офлайн — не дергаем сеть, аккуратно выходим
    if (!isOnline()) {
      return {
        success: true,
        skipped: true,
        message: `Офлайн: пропущено обновление ${pageType}`,
        updatedKeys: [],
      } as const;
    }

    try {
      // Определяем ключи запросов для обновления
      const queryKeys = getQueryKeysForPageType(pageType);

      // Обновляем courseStore для курсов в зависимости от типа страницы
      const courseUpdatePromises: Promise<unknown>[] = [];

      if (pageType === "home" || pageType === "courses") {
        courseUpdatePromises.push(fetchAllCourses());
      }
      if (pageType === "courses") {
        courseUpdatePromises.push(fetchFavorites());
        courseUpdatePromises.push(fetchAuthored());
      }

      // Инвалидируем React Query кэши для пользовательских данных
      const userQueryKeys = queryKeys.filter((key) => key.startsWith("user:"));
      const userUpdatePromises = userQueryKeys.map((key: string) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      );

      // Выполняем все обновления параллельно
      await Promise.all([...courseUpdatePromises, ...userUpdatePromises]);

      logger.warn(`✅ ${pageType} обновлен успешно`, { operation: "warn" });

      // Возвращаем информацию об обновлении
      return {
        success: true,
        message: `${pageType} обновлен`,
        updatedKeys: queryKeys,
      };
    } catch (error) {
      logger.error(`❌ Ошибка обновления ${pageType}:`, error as Error, { operation: "error" });
      reportClientError(error, {
        issueKey: "useRefreshData",
        keys: { operation: "refresh", pageType },
      });
      throw error;
    }
  }, [pageType, queryClient, fetchAllCourses, fetchFavorites, fetchAuthored]);

  return {
    refreshData,
    config: refreshConfigs[pageType],
  };
}

/**
 * Получает ключи запросов для обновления в зависимости от типа страницы
 */
function getQueryKeysForPageType(pageType: RefreshPageType): string[] {
  switch (pageType) {
    case "home":
      return ["user:profile", "user:with-trainings", "user:achievements"];
    case "courses":
      return ["user:achievements"];
    case "trainings":
      return ["user:with-trainings", "user:profile", "user:achievements"];
    case "profile":
      return ["user:profile", "user:pets", "user:achievements"];
    case "achievements":
      return ["user:achievements", "user:profile", "user:with-trainings", "user:training-dates"];
    default:
      return [];
  }
}
