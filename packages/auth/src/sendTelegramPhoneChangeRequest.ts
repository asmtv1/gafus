"use server";

import { randomInt } from "crypto";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-telegram");

function generateShortCode(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Отправляет код подтверждения смены телефона в Telegram.
 * Создаёт PhoneChangeToken, обновляет phoneChangeRequestedAt, шлёт сообщение.
 */
export async function sendTelegramPhoneChangeRequest(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramId: true, phoneChangeRequestedAt: true },
  });

  if (!user?.telegramId) {
    logger.warn("Telegram не привязан к аккаунту", { userId, hasUser: !!user });
    throw new Error("Telegram не привязан к аккаунту");
  }

  const now = new Date();
  const lastRequest = user.phoneChangeRequestedAt;
  if (lastRequest && now.getTime() - lastRequest.getTime() < 60_000) {
    logger.warn("Запрос смены телефона слишком рано", { userId });
    throw new Error("Запрос можно повторить через минуту");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { phoneChangeRequestedAt: now },
  });

  let shortCode: string | null = null;
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode();
    const existing = await prisma.phoneChangeToken.findUnique({
      where: { shortCode: code },
    });
    if (!existing) {
      shortCode = code;
      break;
    }
  }
  if (!shortCode) {
    logger.error("Не удалось сгенерировать уникальный код смены телефона", new Error("No unique code"), { userId });
    throw new Error("Не удалось сгенерировать код. Попробуйте ещё раз");
  }

  await prisma.phoneChangeToken.create({
    data: {
      userId,
      shortCode,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error("TELEGRAM_BOT_TOKEN не задан", new Error("Missing bot token"));
    throw new Error("Сервис временно недоступен");
  }

  const appBaseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || "http://localhost:3000";
  const changePhoneUrl = `${appBaseUrl.replace(/\/$/, "")}/profile/change-phone`;
  const message = `📞 Смена номера телефона. Код: ${shortCode}. Ссылка: ${changePhoneUrl}. Код действителен 15 минут.`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: user.telegramId, text: message }),
  });

  if (response.status === 429) {
    logger.warn("Telegram rate limit при отправке кода смены телефона", { userId });
    throw new Error("Слишком много запросов. Попробуйте через минуту.");
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      "Не удалось отправить сообщение в Telegram (смена телефона)",
      new Error(`HTTP ${response.status}: ${response.statusText}`),
      { status: response.status, responseBody: body },
    );
    throw new Error("Не удалось отправить код. Попробуйте позже.");
  }
}
