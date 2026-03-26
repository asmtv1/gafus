"use server";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-telegram");

/**
 * Заглушка: уведомление в Telegram о смене логина отключено.
 */
export async function sendTelegramUsernameChangeNotification(
  telegramId: string,
  newUsername: string,
): Promise<void> {
  logger.warn("sendTelegramUsernameChangeNotification: заглушка вызвана", {
    telegramId,
    newUsername,
  });
}
