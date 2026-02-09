"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { randomInt } from "crypto";
import { randomUUID } from "crypto";

import { maskPhone } from "./maskPhone";

const logger = createWebLogger("auth-telegram");

function generateShortCode(): string {
  return String(randomInt(100000, 999999));
}

async function ensureUniqueShortCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode();
    const existing = await prisma.passwordResetToken.findUnique({
      where: { shortCode: code },
    });
    if (!existing) return code;
  }
  return generateShortCode();
}

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
      hasUser: !!user,
      hasTelegramId: !!user?.telegramId,
    });
    return;
  }

  const now = new Date();
  const lastRequest = user.passwordResetRequestedAt;
  if (lastRequest && now.getTime() - lastRequest.getTime() < 60 * 1000) {
    logger.warn("Повторный запрос слишком рано", {
      timeSinceLastRequest: now.getTime() - lastRequest.getTime(),
      minInterval: 60 * 1000,
    });
    return;
  }

  await prisma.user.update({
    where: { username: username.toLowerCase().trim() },
    data: { passwordResetRequestedAt: now },
  });

  const token = randomUUID();
  const shortCode = await ensureUniqueShortCode();

  await prisma.passwordResetToken.create({
    data: {
      token,
      shortCode,
      userId: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error("TELEGRAM_BOT_TOKEN не задан", new Error("Missing bot token"), {
      environment: process.env.NODE_ENV,
    });
    return;
  }

  const appBaseUrl =
    process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || "http://localhost:3000";
  const resetLink = `${appBaseUrl.replace(/\/$/, "")}/reset-password`;
  const phoneMasked = maskPhone(phone);
  const message = `🔐 Запрос на сброс пароля:\n👤 Логин: ${username}\n📞 Телефон: ${phoneMasked}\n\n👉 Перейдите по ссылке и введите код:\n${resetLink}\n\n🔑 Ваш код для сброса пароля: ${shortCode}`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
      { status: response.status, statusText: response.statusText, responseBody: body },
    );
    return;
  }
}
