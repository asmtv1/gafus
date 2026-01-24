import { useCourseStoreActions } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для useCoursePrefetch
const logger = createWebLogger("web-course-prefetch");

/**
 * Хук для предзагрузки курсов
 * Автоматически загружает курсы при монтировании компонента
 */
export const useCoursePrefetch = () => {
  const sessionResult = useSession();
  const session = sessionResult?.data;
  const status = sessionResult?.status ?? "unauthenticated";
  const { fetchAllCourses, fetchFavorites, fetchAuthored, allCourses } = useCourseStoreActions();

  useEffect(() => {
    // Предзагружаем курсы только один раз при авторизации
    if (status === "authenticated" && session?.user) {
      // Защита от возможных циклов: не дергаем если уже есть кэш
      if (!allCourses) {
        fetchAllCourses().catch((error) => {
          // Игнорируем ошибки в префетчере
          logger.warn("Ошибка при предзагрузке курсов:", { error, operation: "warn" });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user]);

  return {
    prefetchFavorites: fetchFavorites,
    prefetchAuthored: fetchAuthored,
  };
};

/**
 * Хук для предзагрузки конкретного курса
 */
export const useCoursePrefetchById = (courseId: string) => {
  const { markPrefetched, isPrefetched } = useCourseStoreActions();

  useEffect(() => {
    if (!isPrefetched(courseId)) {
      markPrefetched(courseId);
    }
  }, [courseId, markPrefetched, isPrefetched]);

  return {
    isPrefetched: isPrefetched(courseId),
  };
};
