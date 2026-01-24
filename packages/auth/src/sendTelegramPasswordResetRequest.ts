"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { randomUUID } from "crypto";

// Создаем логгер для auth
const logger = createWebLogger("auth-telegram");

export async function sendTelegramPasswordResetRequest(username: string, phone: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase().trim() },
    select: {
      id: true,
      telegramId: true,
      passwordResetRequestedAt: true,
    },
  });

  if (!user?.telegramId) {
    logger.error("Telegram ID не найден для пользователя", new Error("User not found"), {
      username: username,
      hasUser: !!user,
      hasTelegramId: !!user?.telegramId,
    });
    return;
  }

  const now = new Date();
  const lastRequest = user.passwordResetRequestedAt;
  if (lastRequest && now.getTime() - lastRequest.getTime() < 60 * 1000) {
    logger.warn("Повторный запрос слишком рано", {
      username: username,
      timeSinceLastRequest: now.getTime() - lastRequest.getTime(),
      minInterval: 60 * 1000,
    });
    return;
  }

  await prisma.user.update({
    where: { username: username.toLowerCase().trim() },
    data: { passwordResetRequestedAt: now },
  });

  // Генерация токена и сохранение в базу
  const token = randomUUID();

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 минут
    },
  });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error("TELEGRAM_BOT_TOKEN не задан", new Error("Missing bot token"), {
      hasBotToken: !!botToken,
      environment: process.env.NODE_ENV,
    });
    return;
  }

  const appBaseUrl =
    process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || "http://localhost:3000";
  const resetLink = `${appBaseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  const message = `🔐 Запрос на сброс пароля:\n👤 Логин: ${username}\n📞 Телефон: ${phone}\n\n👉 Для сброса пароля перейдите по ссылке:\n${resetLink}`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: user.telegramId,
      text: message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      "Не удалось отправить сообщение в Telegram",
      new Error(`HTTP ${response.status}: ${response.statusText}`),
      {
        status: response.status,
        statusText: response.statusText,
        responseBody: body,
        username: username,
        telegramId: user.telegramId,
      },
    );
    throw new Error("Не удалось отправить сообщение в Telegram");
  }
}
