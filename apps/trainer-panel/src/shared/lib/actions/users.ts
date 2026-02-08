"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { getPublicProfile } from "@gafus/core/services/user";

import type { PublicProfile } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-users-actions");

export async function getPublicProfileAction(
  username: string,
): Promise<{ success: true; data: PublicProfile } | { success: false; error: string }> {
  try {
    if (!username) {
      return { success: false, error: "Не указан username" };
    }

    const profile = await getPublicProfile(username);

    if (profile !== null) {
      return { success: true, data: profile };
    }

    return { success: false, error: "Пользователь не найден" };
  } catch (error) {
    logger.error("getPublicProfileAction error", error as Error, {
      operation: "get_public_profile_error",
      username: username,
    });
    return { success: false, error: "Не удалось получить профиль пользователя" };
  }
}
