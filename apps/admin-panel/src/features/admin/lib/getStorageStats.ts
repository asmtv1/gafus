"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getStorageStats as getStorageStatsFromCore,
  type StorageStats,
} from "@gafus/core/services/adminStorage";

export type { StorageStats };

/**
 * Получает статистику хранилища видео экзаменов
 * Только для администраторов
 */
export async function getStorageStats(): Promise<{
  success: boolean;
  data?: Awaited<
    ReturnType<typeof getStorageStatsFromCore>
  > extends { success: true; data: infer T }
    ? T
    : never;
  error?: string;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { success: false, error: "Не авторизован" };
  }

  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Доступ запрещен. Только для администраторов." };
  }

  return getStorageStatsFromCore();
}
