"use server";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-telegram");

const STUB_MESSAGE = "Функция временно недоступна. Обратитесь в поддержку.";

/**
 * Заглушка: канал Telegram для сброса пароля отключён.
 */
export async function sendTelegramPasswordResetRequest(
  username: string,
  _phone: string,
): Promise<void> {
  logger.warn("sendTelegramPasswordResetRequest: заглушка вызвана", {
    username: username.toLowerCase().trim(),
  });
  throw new Error(STUB_MESSAGE);
}
