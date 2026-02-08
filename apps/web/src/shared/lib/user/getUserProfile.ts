// lib/user/getUserProfile.ts
"use server";

import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";
import { getUserProfile as getUserProfileCore } from "@gafus/core/services/user";

const logger = createWebLogger("web-get-user-profile");

export async function getUserProfile() {
  try {
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      return null;
    }
    return await getUserProfileCore(userId);
  } catch (error) {
    logger.error("Ошибка в getUserProfile", error as Error, {
      operation: "get_user_profile_error",
    });
    return null;
  }
}
