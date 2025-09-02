import { useCallback } from "react";
import { mutate } from "swr";

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
  const refreshData = useCallback(async () => {
    const config = refreshConfigs[pageType];

    if (!config) {
      throw new Error(`Неизвестный тип страницы: ${pageType}`);
    }

    console.warn(`🔄 ${config.message}`);

    try {
      // Определяем SWR ключи для обновления
      const swrKeys = getSWRKeysForPageType(pageType);
      
      // Обновляем все связанные SWR ключи
      const updatePromises = swrKeys.map((key: string) =>
        mutate(key, undefined, { revalidate: true }),
      );

      await Promise.all(updatePromises);

      console.warn(`✅ ${pageType} обновлен успешно`);

      // Возвращаем информацию об обновлении
      return {
        success: true,
        message: `${pageType} обновлен`,
        updatedKeys: swrKeys,
      };
    } catch (error) {
      console.error(`❌ Ошибка обновления ${pageType}:`, error);
      throw error;
    }
  }, [pageType]);

  return {
    refreshData,
    config: refreshConfigs[pageType],
  };
}

/**
 * Получает SWR ключи для обновления в зависимости от типа страницы
 */
function getSWRKeysForPageType(pageType: RefreshPageType): string[] {
  switch (pageType) {
    case "home":
      return [
        "courses:all",
        "user:profile", 
        "user:with-trainings",
        "user:achievements"
      ];
    case "courses":
      return [
        "courses:all",
        "courses:favorites",
        "courses:authored",
        "user:achievements"
      ];
    case "trainings":
      return [
        "user:with-trainings",
        "user:profile",
        "user:achievements"
      ];
    case "profile":
      return [
        "user:profile",
        "user:preferences",
        "user:pets",
        "user:achievements"
      ];
    case "achievements":
      return [
        "user:achievements",
        "user:profile",
        "user:with-trainings",
        "courses:all"
      ];
    default:
      return [];
  }
}
