import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../../packages/prisma/src/index.js";

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) {
  throw new Error(
    "❌❌❌❌❌❌TELEGRAM_BOT_TOKEN не задан в переменных окружения"
  );
}

export const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg: TelegramBot.Message) => {
  if (!msg.chat) return;
  const chatId = msg.chat.id;

  // Если пользователь уже отправил номер
  if (msg.contact) {
    const phone = "+" + msg.contact.phone_number.replace(/\D/g, "");

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        return bot.sendMessage(
          chatId,
          "Пользователь с этим номером не найден."
        );
      }

      await prisma.user.update({
        where: { phone },
        data: {
          telegramId: chatId.toString(),
          isConfirmed: true,
        },
      });

      return bot.sendMessage(chatId, "✅ Вы успешно подтверждены!");
    } catch (err) {
      bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
    }

    return;
  }

  // Если номер не отправлен — просим отправить его
  bot.sendMessage(
    chatId,
    "Нажмите кнопку ниже, чтобы отправить номер телефона:",
    {
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
    }
  );
});
