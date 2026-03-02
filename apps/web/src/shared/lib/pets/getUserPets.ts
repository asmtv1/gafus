"use server";

import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";
import { getUserPets as getUserPetsFromCore } from "@gafus/core/services/pets";

const logger = createWebLogger("web-get-user-pets");

export async function getUserPets() {
  try {
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      return [];
    }
    return getUserPetsFromCore(userId);
  } catch (error) {
    logger.error("Ошибка при получении питомцев:", error as Error, { operation: "error" });
    return [];
  }
}
