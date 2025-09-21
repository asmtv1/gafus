"use server";

import { getUserProgress } from "@shared/lib/user/getUserProgress";
import { getCurrentUserId } from "@/utils";

/**
 * Серверное действие для получения прогресса текущего пользователя по курсу
 */
export async function getUserProgressForCurrentUser(courseId: string) {
  try {
    const userId = await getCurrentUserId();
    const result = await getUserProgress(courseId, userId);
    return result;
  } catch (error) {
    console.error("Ошибка при получении прогресса пользователя:", error);
    return null;
  }
}

/**
 * Серверное действие для получения прогресса текущего пользователя по нескольким курсам
 */
export async function getUserProgressForMultipleCourses(courseIds: string[]) {
  try {
    const userId = await getCurrentUserId();
    console.log('getUserProgressForMultipleCourses - userId:', userId, 'courseIds:', courseIds);
    
    if (!courseIds || courseIds.length === 0) {
      console.log('No course IDs provided, returning empty map');
      return new Map();
    }
    
    if (!userId) {
      console.log('No user ID found, returning empty map');
      return new Map();
    }
    
    const progressPromises = courseIds.map(courseId => getUserProgress(courseId, userId));
    const results = await Promise.all(progressPromises);
    
    // Создаем объект курсId -> прогресс (Map не сериализуется в JSON)
    const progressMap: Record<string, unknown> = {};
    courseIds.forEach((courseId, index) => {
      progressMap[courseId] = results[index];
    });
    
    console.log('getUserProgressForMultipleCourses - results:', results);
    console.log('getUserProgressForMultipleCourses - progressMap:', progressMap);
    
    return progressMap;
  } catch (error) {
    console.error("Ошибка при получении прогресса по нескольким курсам:", error);
    return {};
  }
}
