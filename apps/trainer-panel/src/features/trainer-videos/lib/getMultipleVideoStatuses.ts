"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import {
  getMultipleVideoStatuses as getMultipleVideoStatusesCore,
  type VideoStatusResult,
} from "@gafus/core/services/trainerVideo";

/**
 * Возвращает статусы транскодирования для нескольких видео. Делегирует в core.
 */
export async function getMultipleVideoStatuses(
  videoIds: string[],
): Promise<VideoStatusResult[] | { error: string }> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }

  if (videoIds.length === 0) {
    return [];
  }

  const result = await getMultipleVideoStatusesCore(videoIds);

  if (!result.success) {
    return { error: result.error ?? "Не удалось получить статусы" };
  }

  return result.data ?? [];
}
