"use server";

import { revalidateTag } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { ADMIN_CACHE_ALL_TAGS } from "@gafus/core/services/cache";

const logger = createWebLogger("admin-panel-invalidate-all-cache");

/**
 * Инвалидирует весь кэш для всех пользователей
 * Используется администраторами после крупных обновлений функционала
 * Очищает все теги кэша Next.js
 *
 * @returns Результат операции с информацией о статусе
 */
export async function invalidateAllCache() {
  try {
    // Проверяем права администратора
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== "ADMIN") {
      logger.warn("[Cache] Unauthorized attempt to invalidate all cache", {
        userId: session?.user?.id,
        role: session?.user?.role,
        operation: "warn",
      });
      return {
        success: false,
        error: "Недостаточно прав доступа. Требуется роль ADMIN.",
      };
    }

    logger.warn("[Cache] Admin initiated full cache invalidation for all users", {
      adminId: session.user.id,
      adminUsername: session.user.username,
      operation: "warn",
    });

    for (const tag of ADMIN_CACHE_ALL_TAGS) {
      revalidateTag(tag);
    }

    logger.warn("[Cache] All cache invalidated successfully for all users", {
      adminId: session.user.id,
      tagsInvalidated: ADMIN_CACHE_ALL_TAGS.length,
      operation: "warn",
    });

    return {
      success: true,
      invalidatedTags: ADMIN_CACHE_ALL_TAGS.length,
      message: `Кэш успешно сброшен! Инвалидировано ${ADMIN_CACHE_ALL_TAGS.length} тегов. ` +
        `Все пользователи получат обновленные данные при следующей загрузке приложения.`,
    };
  } catch (error) {
    logger.error("❌ Error invalidating all cache:", error as Error, { operation: "error" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
