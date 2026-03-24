"use server";

import { getTrainerVideos as getTrainerVideosCore } from "@gafus/core/services/trainerVideo";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import { getCachedSession } from "@/shared/lib/getSessionCached";

import type { AuthUser, TrainerVideoDto } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-get-trainer-videos");

/**
 * Возвращает список видео тренера. Для ADMIN — все видео, для тренера — только свои.
 * Делегирует в core.
 */
export async function getTrainerVideos(
  trainerId: string,
): Promise<TrainerVideoDto[]> {
  try {
    const session = await getCachedSession();
    const user = session?.user as AuthUser | undefined;

    if (!user) {
      throw new Error("Unauthorized: No session or user found.");
    }

    const forAdmin = user.role === "ADMIN";
    return await getTrainerVideosCore(trainerId, { forAdmin });
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getTrainerVideos failed",
      error instanceof Error ? error : new Error(String(error)),
      { trainerId },
    );
    throw error;
  }
}
