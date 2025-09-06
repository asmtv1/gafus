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
    revalidateTag("courses-all");
    revalidateTag("courses-all-permanent");
    revalidateTag("courses-favorites");
    revalidateTag("courses-authored");
    
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
