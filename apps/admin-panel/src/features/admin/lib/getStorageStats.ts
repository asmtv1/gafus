"use server";

import { authOptions } from "@gafus/auth";
import {
  getStorageStats as getStorageStatsFromCore,
  type StorageStats,
} from "@gafus/core/services/adminStorage";
import { createWebLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { unstable_rethrow } from "next/navigation";

export type { StorageStats };

const logger = createWebLogger("admin-get-storage-stats");

/**
 * Получает статистику хранилища видео экзаменов
 * Только для администраторов
 */
export async function getStorageStats(): Promise<
  | { success: true; data: StorageStats }
  | { success: false; error: string }
> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Не авторизован" };
    }

    if (session.user.role !== "ADMIN") {
      return { success: false, error: "Доступ запрещен. Только для администраторов." };
    }

    return await getStorageStatsFromCore();
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getStorageStats",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось загрузить статистику хранилища" };
  }
}
