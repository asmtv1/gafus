"use server";

import { revalidateTag } from "next/cache";

/**
 * Инвалидирует кэш всех курсов
 * Вызывается при создании, обновлении или удалении курсов
 * 
 * @param force - Принудительная инвалидация (игнорирует офлайн статус)
 * @returns Результат операции с информацией о статусе
 */
export async function invalidateCoursesCache(force: boolean = false) {
  try {
    // Проверяем онлайн статус (только на клиенте)
    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;
    
    if (!force && !isOnline) {
      console.warn("[Cache] Skipping courses cache invalidation - user is offline");
      return { 
        success: true, 
        skipped: true, 
        reason: "offline" 
      };
    }
    
    console.warn(`[Cache] Invalidating courses cache... (force: ${force}, online: ${isOnline})`);
    
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
 * 
 * @param force - Принудительная инвалидация (игнорирует офлайн статус)
 * @returns Результат операции с информацией о статусе
 */
export async function invalidateBaseCoursesCache(force: boolean = false) {
  try {
    // Проверяем онлайн статус (только на клиенте)
    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;
    
    if (!force && !isOnline) {
      console.warn("[Cache] Skipping base courses cache invalidation - user is offline");
      return { 
        success: true, 
        skipped: true, 
        reason: "offline" 
      };
    }
    
    console.warn(`[Cache] Invalidating base courses cache... (force: ${force}, online: ${isOnline})`);
    
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
 * 
 * @param userId - ID пользователя
 * @param force - Принудительная инвалидация (игнорирует офлайн статус)
 * @returns Результат операции с информацией о статусе
 */
export async function invalidateUserProgressCache(userId: string, force: boolean = false) {
  try {
    // Проверяем онлайн статус (только на клиенте)
    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;
    
    if (!force && !isOnline) {
      console.warn(`[Cache] Skipping cache invalidation - user is offline (userId: ${userId})`);
      
      // Добавляем действие в очередь синхронизации для выполнения при восстановлении соединения
      try {
        const { addToSyncQueue, createCacheInvalidationAction } = await import(
          "@shared/utils/offlineCacheUtils"
        );
        
        const action = createCacheInvalidationAction(userId, [
          `user-${userId}`,
          "user-progress", 
          "training", 
          "days"
        ]);
        
        addToSyncQueue(action);
        console.warn(`[Cache] Cache invalidation action queued for offline sync (userId: ${userId})`);
      } catch (error) {
        console.warn("[Cache] Failed to queue cache invalidation action:", error);
      }
      
      return { 
        success: true, 
        skipped: true, 
        reason: "offline",
        queued: true
      };
    }
    
    console.warn(`[Cache] Invalidating user progress cache for user: ${userId} (force: ${force}, online: ${isOnline})`);
    
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

/**
 * Утилитарная функция для безопасной инвалидации кэша
 * Автоматически определяет, нужно ли инвалидировать кэш в зависимости от онлайн статуса
 * 
 * @param userId - ID пользователя (опционально)
 * @param options - Опции инвалидации
 * @returns Результат операции
 */
export async function safeInvalidateCache(
  userId?: string, 
  options: {
    force?: boolean;
    includeCourses?: boolean;
    includeBase?: boolean;
    includeUserProgress?: boolean;
  } = {}
) {
  const { 
    force = false, 
    includeCourses = false, 
    includeBase = false, 
    includeUserProgress = true 
  } = options;
  
  const results = [];
  
  try {
    // Инвалидируем кэш курсов если нужно
    if (includeCourses) {
      const coursesResult = await invalidateCoursesCache(force);
      results.push({ type: "courses", ...coursesResult });
    }
    
    // Инвалидируем базовый кэш если нужно
    if (includeBase) {
      const baseResult = await invalidateBaseCoursesCache(force);
      results.push({ type: "base", ...baseResult });
    }
    
    // Инвалидируем кэш прогресса пользователя если нужно
    if (includeUserProgress && userId) {
      const userResult = await invalidateUserProgressCache(userId, force);
      results.push({ type: "user-progress", ...userResult });
    }
    
    // Проверяем, были ли какие-то операции пропущены из-за офлайн статуса
    const skippedResults = results.filter(result => result.skipped);
    const successfulResults = results.filter(result => result.success && !result.skipped);
    
    return {
      success: true,
      results,
      skipped: skippedResults.length > 0,
      skippedCount: skippedResults.length,
      successfulCount: successfulResults.length,
      message: skippedResults.length > 0 
        ? `Cache invalidation completed with ${skippedResults.length} operations skipped (offline mode)`
        : "Cache invalidation completed successfully"
    };
  } catch (error) {
    console.error("❌ Error in safeInvalidateCache:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      results
    };
  }
}
