"use server";

import { prisma } from "@gafus/prisma";
import { randomUUID } from "crypto";

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
    console.error(`❌ Telegram ID не найден для пользователя ${username}`);
    return;
  }

  const now = new Date();
  const lastRequest = user.passwordResetRequestedAt;
  if (lastRequest && now.getTime() - lastRequest.getTime() < 60 * 1000) {
    console.warn(`⏱ Повторный запрос слишком рано для ${username}`);
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
    console.error("❌ TELEGRAM_BOT_TOKEN не задан");
    return;
  }

  const appBaseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || "http://localhost:3000";
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
    console.error(`❌ Не удалось отправить сообщение в Telegram: ${response.status} ${response.statusText} — ${body}`);
    throw new Error("Не удалось отправить сообщение в Telegram");
  }
}
