"use client";

import { useData } from "@gafus/react-query";
import { getUserProgressForCurrentUser, getUserProgressForMultipleCourses } from "@shared/lib/actions/userProgress";

/**
 * Хук для получения детального прогресса пользователя по курсу
 */
export function useUserProgress(courseId: string) {
  return useData(
    `user:progress:${courseId}`,
    async () => {
      const result = await getUserProgressForCurrentUser(courseId);
      return result;
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 300000, // 5 минут
    }
  );
}

/**
 * Хук для получения прогресса по нескольким курсам
 */
export function useUserProgressForCourses(courseIds: string[]) {
  return useData(
    `user:progress:multiple:${courseIds.join(",")}`,
    async () => {
      if (!courseIds || courseIds.length === 0) {
        return {};
      }
      
      const result = await getUserProgressForMultipleCourses(courseIds);
      // Возвращаем обычный объект
      return result || {};
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 300000, // 5 минут
    }
  );
}
