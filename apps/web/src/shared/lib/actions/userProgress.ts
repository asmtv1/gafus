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
    
    if (!courseIds || courseIds.length === 0) {
      return new Map();
    }
    
    const progressPromises = courseIds.map(courseId => getUserProgress(courseId, userId));
    const results = await Promise.all(progressPromises);
    
    // Создаем мапу курсId -> прогресс
    const progressMap = new Map();
    courseIds.forEach((courseId, index) => {
      progressMap.set(courseId, results[index]);
    });
    
    return progressMap;
  } catch (error) {
    console.error("Ошибка при получении прогресса по нескольким курсам:", error);
    return new Map();
  }
}
