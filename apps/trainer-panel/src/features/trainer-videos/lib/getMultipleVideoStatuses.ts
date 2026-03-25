"use server";

import { authOptions } from "@gafus/auth";
import {
  getMultipleVideoStatuses as getMultipleVideoStatusesCore,
  type VideoStatusResult,
} from "@gafus/core/services/trainerVideo";
import { getErrorMessage } from "@gafus/core/errors";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth";

const logger = createTrainerPanelLogger("trainer-get-multiple-video-statuses");

/**
 * Возвращает статусы транскодирования для нескольких видео. Делегирует в core.
 */
export async function getMultipleVideoStatuses(
  videoIds: string[],
): Promise<VideoStatusResult[] | { error: string }> {
  try {
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
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getMultipleVideoStatuses failed",
      error instanceof Error ? error : new Error(String(error)),
      { videoCount: videoIds.length },
    );
    return { error: getErrorMessage(error, "Внутренняя ошибка") };
  }
}
