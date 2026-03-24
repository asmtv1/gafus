"use server";

import { getVisibleDays as getVisibleDaysCore } from "@gafus/core/services/trainingDay";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import { getCachedSession } from "@/shared/lib/getSessionCached";

const logger = createTrainerPanelLogger("trainer-get-visible-days");

export async function getVisibleDays() {
  try {
    const session = await getCachedSession();
    if (!session?.user) return [];

    const userId = session.user.id;
    const role = session.user.role;
    const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

    return await getVisibleDaysCore(userId, isAdminOrModerator);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getVisibleDays failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
