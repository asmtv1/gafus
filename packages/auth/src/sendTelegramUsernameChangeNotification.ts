"use server";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-telegram");

/**
 * Отправляет уведомление в Telegram о смене логина. Некритично: при отсутствии токена или 429 только логируем.
 */
export async function sendTelegramUsernameChangeNotification(
  telegramId: string,
  newUsername: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn("TELEGRAM_BOT_TOKEN не задан, уведомление о смене логина не отправлено");
    return;
  }

  const message = `✅ Вы сменили логин. Теперь ваш логин: @${newUsername}`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text: message }),
  });

  if (response.status === 429) {
    logger.warn("Telegram rate limit при отправке уведомления о смене логина", { telegramId });
    throw new Error("Слишком много запросов. Попробуйте через минуту.");
  }

  if (!response.ok) {
    const body = await response.text();
    logger.warn("Не удалось отправить уведомление о смене логина в Telegram", {
      status: response.status,
      responseBody: body,
    });
  }
}
