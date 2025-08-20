import { prisma } from "@gafus/prisma";
import { Telegraf } from "telegraf";

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) {
  throw new Error("❌❌❌❌❌❌TELEGRAM_BOT_TOKEN не задан в переменных окружения");
}

export const bot = new Telegraf(token);

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error("❌ Bot error:", err);
  ctx.reply("Произошла ошибка. Попробуйте позже.");
});

bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const chatId = ctx.chat.id;

  // Если пользователь уже отправил номер
  if ("contact" in msg && msg.contact) {
    const phone = "+" + msg.contact.phone_number.replace(/\D/g, "");

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        return ctx.reply("Пользователь с этим номером не найден.");
      }

      await prisma.user.update({
        where: { phone },
        data: {
          telegramId: chatId.toString(),
          isConfirmed: true,
        },
      });

      return ctx.reply("✅ Вы успешно подтверждены!");
    } catch (err) {
      console.error("Ошибка при обновлении пользователя:", err);
      ctx.reply("Произошла ошибка. Попробуйте позже.");
    }

    return;
  }

  // Если номер не отправлен — просим отправить его
  ctx.reply("Нажмите кнопку ниже, чтобы отправить номер телефона:", {
    reply_markup: {
      keyboard: [
        [
          {
            text: "📲 Подтвердить номер",
            request_contact: true,
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Запуск бота
bot.launch();

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
