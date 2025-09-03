"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getCoursesWithProgressCached } from "@shared/lib/actions/cachedCourses";
import { getFavoritesCoursesCached } from "@shared/lib/actions/cachedCourses";
import { getAuthoredCoursesCached } from "@shared/lib/actions/cachedCourses";

import type { CourseWithProgressData, AuthoredCourse } from "@gafus/types";

// Тип из getFavoritesCourses
interface CourseWithUserData {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  avgRating: number | null;
  createdAt: Date;
  authorUsername: string;
  favoritedBy: unknown[];
  reviews: unknown[];
  access: unknown[];
  userStatus: CourseWithProgressData["userStatus"];
  startedAt: Date | null;
  completedAt: Date | null;
  isFavorite: boolean;
}

export function useCourses() {
  return useData<CourseWithProgressData[]>(
    "courses:all",
    async () => {
      const result = await getCoursesWithProgressCached();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data || [];
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, // Обновляем при восстановлении соединения
      staleTime: 60 * 60 * 1000, // 1 час - курсы редко изменяются
      gcTime: 24 * 60 * 60 * 1000, // 24 часа - кэш хранится долго
      networkMode: "offlineFirst", // Сначала используем кэш, потом сеть
      retry: (failureCount, error) => {
        // В офлайне не повторяем
        if (!navigator.onLine) return false;
        // Для сетевых ошибок повторяем меньше
        if (error instanceof Error && error.message.includes('fetch')) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
    },
  );
}

export function useFavorites() {
  return useData<CourseWithUserData[]>(
    "courses:favorites",
    async () => {
      const result = await getFavoritesCoursesCached();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data || [];
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30 * 60 * 1000, // 30 минут - избранное может изменяться чаще
      gcTime: 12 * 60 * 60 * 1000, // 12 часов
      networkMode: "offlineFirst",
      retry: (failureCount, error) => {
        if (!navigator.onLine) return false;
        if (error instanceof Error && error.message.includes('fetch')) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
    },
  );
}

export function useAuthored() {
  return useData<AuthoredCourse[]>(
    "courses:authored",
    async () => {
      const result = await getAuthoredCoursesCached();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data || [];
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 15 * 60 * 1000, // 15 минут - созданные курсы могут обновляться чаще
      gcTime: 6 * 60 * 60 * 1000, // 6 часов
      networkMode: "offlineFirst",
      retry: (failureCount, error) => {
        if (!navigator.onLine) return false;
        if (error instanceof Error && error.message.includes('fetch')) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
    },
  );
}

export function useCoursesMutation() {
  const { mutate } = useMutate();

  const invalidateAllCourses = () => {
    mutate("courses:all");
    // Инвалидируем достижения при изменении курсов
    mutate("user:achievements");
  };

  const invalidateFavorites = () => {
    mutate("courses:favorites");
    // Инвалидируем достижения при изменении избранного
    mutate("user:achievements");
  };

  const invalidateAuthored = () => {
    mutate("courses:authored");
    // Инвалидируем достижения при изменении созданных курсов
    mutate("user:achievements");
  };

  const invalidateAll = () => {
    invalidateAllCourses();
    invalidateFavorites();
    invalidateAuthored();
    // Инвалидируем все связанные данные
    mutate("user:profile");
    mutate("user:with-trainings");
  };

  return {
    invalidateAllCourses,
    invalidateFavorites,
    invalidateAuthored,
    invalidateAll,
  };
}
