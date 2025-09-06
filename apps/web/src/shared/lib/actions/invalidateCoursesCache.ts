"use server";

import { revalidateTag } from "next/cache";

/**
 * Инвалидирует кэш всех курсов
 * Вызывается при создании, обновлении или удалении курсов
 */
export async function invalidateCoursesCache() {
  try {
    console.warn("[Cache] Invalidating courses cache...");
    
    // Инвалидируем все теги, связанные с курсами
    revalidateTag("courses");
    revalidateTag("courses-all"); // Инвалидирует кэш для всех пользователей
    revalidateTag("courses-all-permanent"); // Инвалидирует базовый кэш всех курсов
    revalidateTag("courses-favorites");
    revalidateTag("courses-authored");
    revalidateTag("user-progress"); // Инвалидирует кэш прогресса пользователей
    
    // Примечание: теги с userId (например, "user-123") будут автоматически
    // инвалидированы при следующем запросе пользователя, так как
    // getCoursesWithProgressCached пересоздаст кэш с новыми данными
    
    console.warn("[Cache] Courses cache invalidated successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ Error invalidating courses cache:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Инвалидирует только базовый кэш курсов (без пользовательских данных)
 * Используется при изменении структуры курсов
 */
export async function invalidateBaseCoursesCache() {
  try {
    console.warn("[Cache] Invalidating base courses cache...");
    
    revalidateTag("courses-all-permanent");
    
    console.warn("[Cache] Base courses cache invalidated successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ Error invalidating base courses cache:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Инвалидирует кэш прогресса конкретного пользователя
 * Используется при изменении прогресса пользователя
 */
export async function invalidateUserProgressCache(userId: string) {
  try {
    console.warn(`[Cache] Invalidating user progress cache for user: ${userId}`);
    
    revalidateTag(`user-${userId}`);
    revalidateTag("user-progress");
    revalidateTag("training"); // Инвалидируем кэш дней тренировок
    revalidateTag("days"); // Инвалидируем кэш дней тренировок
    
    console.warn(`[Cache] User progress cache invalidated successfully for user: ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Error invalidating user progress cache:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
