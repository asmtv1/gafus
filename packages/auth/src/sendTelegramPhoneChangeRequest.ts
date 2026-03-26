"use server";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-telegram");

const STUB_MESSAGE = "Функция временно недоступна. Обратитесь в поддержку.";

/**
 * Заглушка: канал Telegram для смены телефона отключён.
 */
export async function sendTelegramPhoneChangeRequest(userId: string): Promise<void> {
  logger.warn("sendTelegramPhoneChangeRequest: заглушка вызвана", { userId });
  throw new Error(STUB_MESSAGE);
}
