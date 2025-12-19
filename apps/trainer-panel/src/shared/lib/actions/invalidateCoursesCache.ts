"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

// Создаем логгер для invalidate-courses-cache
const logger = createTrainerPanelLogger('trainer-panel-invalidate-courses-cache');

/**
 * Инвалидирует кэш всех курсов
 * Вызывается при создании, обновлении или удалении курсов
 */
export async function invalidateCoursesCache() {
  try {
    logger.warn("[Cache] Invalidating courses cache...", { operation: 'warn' });
    
    // Инвалидируем все теги, связанные с курсами
    revalidateTag("courses");
    revalidateTag("courses-all");
    revalidateTag("courses-all-permanent");
    revalidateTag("courses-favorites");
    revalidateTag("courses-authored");
    revalidateTag("courses-metadata");
    
    logger.warn("[Cache] Courses cache invalidated successfully", { operation: 'warn' });
    return { success: true };
  } catch (error) {
    logger.error("❌ Error invalidating courses cache:", error as Error, { operation: 'error' });
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
    logger.warn("[Cache] Invalidating base courses cache...", { operation: 'warn' });
    
    revalidateTag("courses-all-permanent");
    
    logger.warn("[Cache] Base courses cache invalidated successfully", { operation: 'warn' });
    return { success: true };
  } catch (error) {
    logger.error("❌ Error invalidating base courses cache:", error as Error, { operation: 'error' });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
