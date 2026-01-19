"use client";

import { useData } from "@gafus/react-query";
import { getCoursesWithProgressAction } from "@shared/server-actions";

/**
 * Хук для получения курсов пользователя с прогрессом
 */
export function useUserCourses() {
  return useData(
    "user:courses-with-progress",
    async () => {
      const result = await getCoursesWithProgressAction();
      return result.data;
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 300000, // 5 минут
      placeholderData: (previousData) => previousData,
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
