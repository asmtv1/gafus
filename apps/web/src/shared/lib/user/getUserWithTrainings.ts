"use server";

import { getUserWithTrainings as getUserWithTrainingsCore } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

import type { UserWithTrainings } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-get-user-with-trainings");

export async function getUserWithTrainings(): Promise<UserWithTrainings | null> {
  try {
    const userId = await getCurrentUserId();
    return await getUserWithTrainingsCore(userId);
  } catch (error) {
    try {
      logger.error("Ошибка в getUserWithTrainings", error as Error, {
        operation: "get_user_with_trainings_error",
      });
    } catch (logError) {
      console.error("Logger error in getUserWithTrainings catch:", logError);
    }
    throw new Error("Не удалось загрузить данные пользователя с тренировками");
  }
}
