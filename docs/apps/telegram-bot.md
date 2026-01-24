# Telegram Bot (@gafus/telegram-bot)

## 📋 Обзор

Telegram Bot GAFUS - это автоматизированный бот для интеграции с Telegram, предоставляющий пользователям уведомления о тренировках, возможность сброса пароля и получение справочной информации.

## 🎯 Основные функции

### Уведомления

- **🔔 Уведомления о тренировках** - Напоминания о начале тренировок
- **📊 Прогресс тренировок** - Уведомления о завершении этапов
- **🏆 Достижения** - Уведомления о получении наград
- **📅 Календарь тренировок** - Планирование и напоминания

### Аутентификация

- **🔐 Сброс пароля** - Восстановление доступа через Telegram
- **✅ Подтверждение аккаунта** - Верификация через бота
- **🔗 Связывание аккаунтов** - Привязка Telegram к профилю

### Информационная поддержка

- **📚 Справочная информация** - Помощь по использованию системы
- **📞 Техническая поддержка** - Связь с администраторами
- **📈 Статистика** - Личная статистика пользователя

## 🏗️ Архитектура

### Структура приложения

```
apps/telegram-bot/
├── bot.ts                   # Основной файл бота
├── src/                     # Исходный код (если есть)
├── package.json
└── tsconfig.json
```

### Интеграция с системой

```typescript
// bot.ts - Основная логика бота
import { Bot } from "grammy";
import { PrismaClient } from "@gafus/prisma";
import { logger } from "@gafus/logger";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const prisma = new PrismaClient();
```

## 🔧 Технические особенности

### Обработка команд

```typescript
// Команды бота
bot.command("start", async (ctx) => {
  const username = ctx.from?.username;
  if (username) {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.from?.id.toString() },
    });

    if (user) {
      await ctx.reply(`Привет, ${user.username}! Добро пожаловать в GAFUS!`);
    } else {
      await ctx.reply("Для использования бота необходимо связать аккаунт с профилем на сайте.");
    }
  }
});

bot.command("help", async (ctx) => {
  const helpText = `
🤖 GAFUS Bot - Помощник по обучению питомцев

📋 Доступные команды:
/start - Начать работу с ботом
/help - Показать справку
/reset_password - Сбросить пароль
/stats - Показать статистику
/support - Связаться с поддержкой
  `;
  await ctx.reply(helpText);
});
```

### Сброс пароля

```typescript
bot.command("reset_password", async (ctx) => {
  const username = ctx.message?.text?.split(" ")[1];

  if (!username) {
    await ctx.reply("Пожалуйста, укажите имя пользователя: /reset_password your_username");
    return;
  }

  try {
    // Поиск пользователя
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      await ctx.reply("Пользователь не найден. Проверьте правильность имени пользователя.");
      return;
    }

    // Связывание Telegram ID с пользователем
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramId: ctx.from?.id.toString() },
    });

    // Генерация токена сброса пароля
    const resetToken = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа
      },
    });

    // Отправка ссылки для сброса пароля
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;
    await ctx.reply(`Для сброса пароля перейдите по ссылке: ${resetUrl}`);

    logger.info("Password reset requested via Telegram", {
      userId: user.id,
      username: user.username,
      telegramId: ctx.from?.id,
    });
  } catch (error) {
    logger.error("Error in password reset", { error: error.message });
    await ctx.reply("Произошла ошибка при сбросе пароля. Попробуйте позже.");
  }
});
```

### Уведомления о тренировках

```typescript
// Функция отправки уведомления о тренировке
async function sendTrainingNotification(userId: string, trainingData: any) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pets: true },
    });

    if (!user?.telegramId) return;

    const message = `
🏃‍♂️ Время для тренировки!

📚 Курс: ${trainingData.courseName}
📅 День: ${trainingData.dayTitle}
⏱️ Шаг: ${trainingData.stepTitle}
⏰ Продолжительность: ${trainingData.duration} минут

🐕 Питомец: ${user.pets[0]?.name || "Ваш питомец"}

Удачной тренировки! 🎯
    `;

    await bot.api.sendMessage(user.telegramId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "📱 Открыть тренировку", url: trainingData.trainingUrl }]],
      },
    });

    logger.info("Training notification sent", {
      userId,
      telegramId: user.telegramId,
      trainingId: trainingData.trainingId,
    });
  } catch (error) {
    logger.error("Failed to send training notification", {
      userId,
      error: error.message,
    });
  }
}
```

### Статистика пользователя

```typescript
bot.command("stats", async (ctx) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.from?.id.toString() },
      include: {
        pets: true,
        userTrainings: {
          where: { status: "COMPLETED" },
          include: {
            dayOnCourse: {
              include: { course: true },
            },
          },
        },
      },
    });

    if (!user) {
      await ctx.reply("Аккаунт не связан. Используйте /reset_password для связи аккаунта.");
      return;
    }

    const completedTrainings = user.userTrainings.length;
    const totalPets = user.pets.length;
    const completedCourses = new Set(user.userTrainings.map((t) => t.dayOnCourse.courseId)).size;

    const statsMessage = `
📊 Ваша статистика в GAFUS:

🐕 Питомцев: ${totalPets}
📚 Завершенных курсов: ${completedCourses}
🏃‍♂️ Завершенных тренировок: ${completedTrainings}

Продолжайте в том же духе! 🎯
    `;

    await ctx.reply(statsMessage);
  } catch (error) {
    logger.error("Error getting user stats", { error: error.message });
    await ctx.reply("Ошибка при получении статистики. Попробуйте позже.");
  }
});
```

## 🔔 Система уведомлений

### Интеграция с очередями

```typescript
import { addJob } from "@gafus/queues";

// Добавление задачи отправки уведомления
async function scheduleNotification(userId: string, notificationData: any) {
  await addJob(
    "telegram-notifications",
    "send-notification",
    {
      userId,
      ...notificationData,
    },
    {
      delay: notificationData.delay || 0,
      attempts: 3,
    },
  );
}

// Обработка задач уведомлений
export async function processNotification(job: any) {
  const { userId, type, data } = job.data;

  switch (type) {
    case "training_reminder":
      await sendTrainingNotification(userId, data);
      break;
    case "achievement":
      await sendAchievementNotification(userId, data);
      break;
    case "course_completed":
      await sendCourseCompletedNotification(userId, data);
      break;
    default:
      logger.warn("Unknown notification type", { type, userId });
  }
}
```

### Типы уведомлений

```typescript
// Уведомление о достижении
async function sendAchievementNotification(userId: string, achievementData: any) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.telegramId) return;

  const message = `
🏆 Поздравляем с достижением!

${achievementData.title}
${achievementData.description}

🎯 Продолжайте тренировки!
  `;

  await bot.api.sendMessage(user.telegramId, message);
}

// Уведомление о завершении курса
async function sendCourseCompletedNotification(userId: string, courseData: any) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.telegramId) return;

  const message = `
🎉 Курс завершен!

📚 "${courseData.courseName}"
⏱️ Время прохождения: ${courseData.completionTime}
🏆 Получено достижений: ${courseData.achievements}

Отличная работа! 🎯
  `;

  await bot.api.sendMessage(user.telegramId, message);
}
```

## 🔐 Безопасность

### Валидация команд

```typescript
// Middleware для проверки авторизации
bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id.toString();

  if (ctx.message?.text?.startsWith("/reset_password")) {
    // Команда сброса пароля доступна всем
    return next();
  }

  // Для других команд проверяем связь с аккаунтом
  const user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    await ctx.reply(
      "Для использования этой функции необходимо связать аккаунт с профилем на сайте.",
    );
    return;
  }

  return next();
});
```

### Rate limiting

```typescript
import { rateLimit } from "./utils/rateLimit";

// Ограничение частоты запросов
bot.use(
  rateLimit({
    windowMs: 60000, // 1 минута
    max: 10, // максимум 10 запросов в минуту
  }),
);
```

## 📊 Логирование и мониторинг

### Логирование действий

```typescript
import { logger } from "@gafus/logger";

// Логирование всех команд
bot.use(async (ctx, next) => {
  const command = ctx.message?.text?.split(" ")[0];
  const userId = ctx.from?.id;

  logger.info("Telegram command received", {
    command,
    userId,
    username: ctx.from?.username,
    chatId: ctx.chat?.id,
  });

  return next();
});
```

### Обработка ошибок

```typescript
// Глобальный обработчик ошибок
bot.catch((err) => {
  logger.error("Telegram bot error", {
    error: err.message,
    stack: err.stack,
    update: err.ctx?.update,
  });
});

// Обработка ошибок API
bot.api.config.use((previous, method, payload, signal) => {
  return previous(method, payload, signal).catch((error) => {
    logger.error("Telegram API error", {
      method,
      error: error.message,
      payload,
    });
    throw error;
  });
});
```

## 🧪 Тестирование

### Unit тесты

```typescript
import { describe, it, expect, jest } from "@jest/globals";

describe("Telegram Bot", () => {
  it("should handle start command", async () => {
    const mockCtx = {
      from: { id: 123, username: "testuser" },
      reply: jest.fn(),
    };

    await handleStartCommand(mockCtx);

    expect(mockCtx.reply).toHaveBeenCalled();
  });
});
```

### Integration тесты

```typescript
import { Bot } from "grammy";

describe("Bot Integration", () => {
  it("should send notification", async () => {
    const bot = new Bot("test-token");

    await sendTrainingNotification("user123", {
      courseName: "Test Course",
      dayTitle: "Day 1",
      stepTitle: "Step 1",
    });

    // Проверка отправки сообщения
  });
});
```

## 🚀 Развертывание

### Переменные окружения

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram-webhook

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/gafus

# App URLs
NEXT_PUBLIC_APP_URL=https://gafus.ru
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/bot.js"]
```

### Webhook настройка

```typescript
// Настройка webhook для продакшена
if (process.env.NODE_ENV === "production") {
  await bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL!);
}
```

## 🔧 Разработка

### Команды разработки

```bash
# Разработка
pnpm dev                    # Запуск в режиме разработки
pnpm build                  # Сборка TypeScript
pnpm start                  # Запуск продакшен версии

# Тестирование
pnpm test                   # Запуск тестов
pnpm test:watch            # Тесты в режиме наблюдения
```

### Структура проекта

```typescript
// Основные модули
bot.ts                      # Главный файл бота
├── commands/               # Обработчики команд
├── handlers/               # Обработчики сообщений
├── utils/                  # Утилиты
└── types/                  # TypeScript типы
```

---

_Telegram Bot GAFUS обеспечивает удобную интеграцию с мессенджером для уведомлений и поддержки пользователей._
