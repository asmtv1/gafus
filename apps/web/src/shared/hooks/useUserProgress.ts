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
        return new Map();
      }
      
      const result = await getUserProgressForMultipleCourses(courseIds);
      // Убеждаемся, что возвращаем Map объект
      return result instanceof Map ? result : new Map();
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 300000, // 5 минут
    }
  );
}
