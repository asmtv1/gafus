"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { checkUserState } from "@shared/lib/auth/login-utils";

const logger = createWebLogger('web-check-user-state');

const usernameSchema = z
  .string()
  .trim()
  .min(1, "Некорректное имя пользователя")
  .max(100, "Некорректное имя пользователя")
  .transform((value) => value.toLowerCase());

export async function checkUserStateAction(username: string) {
  try {
    const normalizedUsername = usernameSchema.parse(username);

    logger.warn("🔍 checkUserState server action called", { operation: 'warn' });
    logger.warn("👤 Username:", { normalizedUsername, operation: 'warn' });

    const state = await checkUserState(normalizedUsername);
    logger.warn("✅ User state:", { state, operation: 'warn' });

    return state;
  } catch (error) {
    logger.error("❌ Ошибка в checkUserStateAction:", error as Error, { operation: 'error' });
    throw new Error("Внутренняя ошибка сервера");
  }
}
