import { useCallback } from "react";
import { mutate } from "swr";

// Типы для разных страниц
export type RefreshPageType = "home" | "courses" | "trainings" | "profile";

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
};

export function useRefreshData(pageType: RefreshPageType) {
  const refreshData = useCallback(async () => {
    const config = refreshConfigs[pageType];

    if (!config) {
      throw new Error(`Неизвестный тип страницы: ${pageType}`);
    }

    console.warn(`🔄 ${config.message}`);

    try {
      // Обновляем все связанные endpoints
      const updatePromises = config.endpoints.map((endpoint) =>
        mutate(endpoint, undefined, { revalidate: true }),
      );

      await Promise.all(updatePromises);

      console.warn(`✅ ${pageType} обновлен успешно`);

      // Возвращаем информацию об обновлении
      return {
        success: true,
        message: `${pageType} обновлен`,
        updatedEndpoints: config.endpoints,
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
