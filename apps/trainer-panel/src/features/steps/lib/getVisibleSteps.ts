"use server";

import { getVisibleSteps as getVisibleStepsCore } from "@gafus/core/services/trainerStep";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import { getCachedSession } from "@/shared/lib/getSessionCached";

import type { AuthUser } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-get-visible-steps");

export async function getVisibleSteps() {
  try {
    const session = await getCachedSession();
    const user = session?.user as AuthUser;

    if (!user) {
      throw new Error("Unauthorized: No session or user found.");
    }

    const { id: userId, role } = user;
    const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

    return await getVisibleStepsCore(userId, isAdminOrModerator);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getVisibleSteps failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
