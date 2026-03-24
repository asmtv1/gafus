"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { getUserProgress as getUserProgressInternal } from "@gafus/statistics";
import { unstable_rethrow } from "next/navigation";

export type { UserDetailedProgress, UserDayProgress } from "@gafus/statistics";

const logger = createTrainerPanelLogger("trainer-get-user-progress");

export async function getUserProgress(courseId: string, userId: string) {
  try {
    return await getUserProgressInternal(courseId, userId);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getUserProgress failed",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, userId },
    );
    throw error;
  }
}
