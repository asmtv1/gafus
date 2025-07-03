"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const index_js_1 = require("../../packages/prisma/src/index.js");
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error("❌❌❌❌❌❌TELEGRAM_BOT_TOKEN не задан в переменных окружения");
}
exports.bot = new node_telegram_bot_api_1.default(token, { polling: true });
exports.bot.on("message", async (msg) => {
    if (!msg.chat)
        return;
    const chatId = msg.chat.id;
    // Если пользователь уже отправил номер
    if (msg.contact) {
        const phone = "+" + msg.contact.phone_number.replace(/\D/g, "");
        try {
            const user = await index_js_1.prisma.user.findUnique({ where: { phone } });
            if (!user) {
                return exports.bot.sendMessage(chatId, "Пользователь с этим номером не найден.");
            }
            await index_js_1.prisma.user.update({
                where: { phone },
                data: {
                    telegramId: chatId.toString(),
                    isConfirmed: true,
                },
            });
            return exports.bot.sendMessage(chatId, "✅ Вы успешно подтверждены!");
        }
        catch (err) {
            exports.bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
        }
        return;
    }
    // Если номер не отправлен — просим отправить его
    exports.bot.sendMessage(chatId, "Нажмите кнопку ниже, чтобы отправить номер телефона:", {
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
