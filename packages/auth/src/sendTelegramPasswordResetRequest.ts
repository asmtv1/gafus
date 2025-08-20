"use server";

import { prisma } from "@gafus/prisma";

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
  const token = crypto.randomUUID();

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

  // Замените на новый домен!!!
  const resetLink = `http://localhost:3000/reset-password?token=${token}`;
  const message = `🔐 Запрос на сброс пароля:\n👤 Логин: ${username}\n📞 Телефон: ${phone}\n\n👉 Для сброса пароля перейдите по ссылке:\n${resetLink}`;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: user.telegramId,
      text: message,
    }),
  });
}
