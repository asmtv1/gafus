"use client";

import { useData } from "@gafus/swr";
import { getCoursesWithProgress } from "@shared/lib/course/getCourses";

/**
 * Хук для получения курсов пользователя с прогрессом
 */
export function useUserCourses() {
  return useData(
    "user:courses-with-progress",
    async () => {
      const result = await getCoursesWithProgress();
      return result.data;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 300000, // 5 минут
      keepPreviousData: true,
    }
  );
}

/**
 * Хук для получения только начатых курсов пользователя
 */
export function useUserStartedCourses() {
  const { data, error, isLoading } = useUserCourses();
  
  const startedCourses = data?.filter(course => 
    course.userStatus !== "NOT_STARTED"
  ) || [];

  return {
    data: startedCourses,
    error,
    isLoading,
  };
}
