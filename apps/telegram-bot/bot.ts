import { prisma } from "@gafus/prisma";
import { createTelegramBotLogger } from "@gafus/logger";
import { Telegraf } from "telegraf";

// Создаем логгер для telegram-bot
const logger = createTelegramBotLogger('telegram-bot');

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) {
  logger.fatal("TELEGRAM_BOT_TOKEN не задан в переменных окружения", new Error("Missing Telegram Bot Token"), {
    environment: process.env.NODE_ENV || 'development',
    hasToken: !!process.env.TELEGRAM_BOT_TOKEN
  });
  throw new Error("❌❌❌❌❌❌TELEGRAM_BOT_TOKEN не задан в переменных окружения");
}

logger.info("Telegram bot initializing", {
  environment: process.env.NODE_ENV || 'development',
  hasToken: !!token,
  tokenLength: token.length
});

export const bot = new Telegraf(token);

// Обработка ошибок
bot.catch(async (err, ctx) => {
  await logger.error("Bot error", err as Error, {
    chatId: ctx.chat?.id,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    messageType: ctx.message ? Object.keys(ctx.message)[0] : 'unknown',
    updateId: ctx.update.update_id
  });
  ctx.reply("Произошла ошибка. Попробуйте позже.");
});

bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const chatId = ctx.chat.id;

  // Если пользователь уже отправил номер
  if ("contact" in msg && msg.contact) {
    const phone = "+" + msg.contact.phone_number.replace(/\D/g, "");

    let user = null;
    try {
      user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        logger.warn("Пользователь с номером не найден в базе данных", {
          chatId: chatId,
          phone: phone,
          operation: 'find_user_by_phone'
        });
        return ctx.reply("Пользователь с этим номером не найден.");
      }

      await prisma.user.update({
        where: { phone },
        data: {
          telegramId: chatId.toString(),
          isConfirmed: true,
        },
      });

      logger.success("Пользователь успешно подтвержден через Telegram", {
        chatId: chatId,
        phone: phone,
        userId: user.id,
        username: user.username,
        operation: 'confirm_user_telegram'
      });

      return ctx.reply("✅ Вы успешно подтверждены!");
    } catch (err) {
      await logger.error("Ошибка при обновлении пользователя", err as Error, {
        chatId: chatId,
        phone: phone,
        hasUser: !!user,
        operation: 'update_user_telegram_id'
      });
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
bot.launch().then(() => {
  logger.success("Telegram bot launched successfully", {
    environment: process.env.NODE_ENV || 'development',
    botUsername: bot.botInfo?.username || 'unknown'
  });
}).catch((error) => {
  logger.fatal("Failed to launch Telegram bot", error as Error, {
    environment: process.env.NODE_ENV || 'development',
    hasToken: !!token
  });
});

// Graceful stop
process.once("SIGINT", () => {
  logger.info("Received SIGINT, stopping bot gracefully");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  logger.info("Received SIGTERM, stopping bot gracefully");
  bot.stop("SIGTERM");
});
