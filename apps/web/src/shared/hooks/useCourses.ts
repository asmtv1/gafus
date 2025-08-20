"use client";

import { useData, useMutate } from "@gafus/swr";
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
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30 секунд
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
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30 секунд
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
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30 секунд
    },
  );
}

export function useCoursesMutation() {
  const { mutate } = useMutate();

  const invalidateAllCourses = () => {
    mutate("courses:all", undefined);
  };

  const invalidateFavorites = () => {
    mutate("courses:favorites", undefined);
  };

  const invalidateAuthored = () => {
    mutate("courses:authored", undefined);
  };

  const invalidateAll = () => {
    invalidateAllCourses();
    invalidateFavorites();
    invalidateAuthored();
  };

  return {
    invalidateAllCourses,
    invalidateFavorites,
    invalidateAuthored,
    invalidateAll,
  };
}
