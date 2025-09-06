"use server";

import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { invalidateCoursesCache } from "./invalidateCoursesCache";

export interface InvalidateCacheResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Серверное действие для инвалидации кэша курсов
 * Доступно только для администраторов и модераторов
 */
export async function invalidateCoursesCacheAction(): Promise<InvalidateCacheResult> {
  try {
    // Проверяем авторизацию и права администратора
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: "Не авторизован"
      };
    }

    // Проверяем права администратора
    if (!session.user.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return {
        success: false,
        error: "Недостаточно прав для выполнения операции"
      };
    }

    // Инвалидируем кэш курсов
    const result = await invalidateCoursesCache();
    
    if (result.success) {
      return {
        success: true,
        message: "Кэш курсов успешно обновлен"
      };
    } else {
      return {
        success: false,
        error: result.error || "Ошибка при обновлении кэша"
      };
    }
  } catch (error) {
    console.error("Error in invalidateCoursesCacheAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка"
    };
  }
}
