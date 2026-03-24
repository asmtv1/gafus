"use server";

import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";
import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-get-current-user-id");

export async function getCurrentUserId(): Promise<string> {
  try {
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      throw new Error("Пользователь не авторизован");
    }
    return userId;
  } catch (error) {
    unstable_rethrow(error);
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message === "Пользователь не авторизован") {
      throw err;
    }
    logger.error("Неожиданная ошибка getCurrentUserId", err);
    throw err;
  }
}
