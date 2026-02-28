/**
 * Отправка напоминаний о тренировках
 * Проверяет настройки пользователей и отправляет push-уведомления
 */

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import { PushNotificationService } from "@gafus/webpush";
import { partitionPushSubscriptions } from "./lib/partitionPushSubscriptions";
import { sendExpoPushNotifications } from "./lib/expoPush";
import { sendRustorePushNotifications } from "./lib/rustorePush";

const logger = createWorkerLogger("training-reminders-sender");

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

const pushService = PushNotificationService.fromEnvironment();

/**
 * Проверяет, совпадает ли текущий день недели с выбранными днями
 */
function matchesDayOfWeek(reminderDays: string | null, currentDayOfWeek: number): boolean {
  // Если reminderDays не указано - все дни
  if (!reminderDays) return true;

  // currentDayOfWeek: 0=Воскресенье, 1=Понедельник, ..., 6=Суббота (Date.getDay())
  // reminderDays: "1,2,3,4,5" где 1=Пн, 7=Вс
  // Конвертируем: 0->7, 1->1, 2->2, ..., 6->6
  const dayNumber = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;

  const selectedDays = reminderDays.split(",");
  return selectedDays.includes(dayNumber.toString());
}

/**
 * Проверяет, совпадает ли текущее время с временем напоминания
 * Допускается расхождение ±5 минут
 */
function matchesTime(reminderTime: string, currentTime: Date): boolean {
  const [hours, minutes] = reminderTime.split(":").map(Number);
  const currentHours = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();

  // Вычисляем разницу в минутах
  const reminderTotalMinutes = hours * 60 + minutes;
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const diff = Math.abs(reminderTotalMinutes - currentTotalMinutes);

  // Допускаем расхождение ±5 минут
  return diff <= 5;
}

/**
 * Проверяет, не отправляли ли уже сегодня напоминание
 */
function wasAlreadySentToday(lastSentAt: Date | null, currentTime: Date): boolean {
  if (!lastSentAt) return false;

  // Проверяем, что lastSentAt сегодня
  const lastSentDate = new Date(lastSentAt);
  return (
    lastSentDate.getFullYear() === currentTime.getFullYear() &&
    lastSentDate.getMonth() === currentTime.getMonth() &&
    lastSentDate.getDate() === currentTime.getDate()
  );
}

/**
 * Отправляет напоминание о тренировке пользователю
 */
async function sendReminderToUser(
  userId: string,
  timezone: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Получаем подписки пользователя
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      logger.warn("У пользователя нет push-подписок", { userId });
      return { success: false, error: "No subscriptions" };
    }

    // Создаём payload уведомления
    const payload = JSON.stringify({
      title: "Напоминание о тренировке 🐕",
      body: "Пора заниматься с питомцем! Не забудьте про сегодняшнюю тренировку.",
      icon: "/icons/icon192.png",
      badge: "/icons/badge-72.png",
      data: {
        url: "/courses",
      },
    });

    const partitioned = partitionPushSubscriptions(subscriptions);

    const webResults =
      partitioned.web.length > 0 ?
        await pushService.sendNotifications(partitioned.web, payload)
      : {
          results: [],
          successCount: 0,
          failureCount: 0,
        };

    const invalidWebEndpoints = webResults.results
      .filter((result) => !result.success && PushNotificationService.shouldDeleteSubscription(result.error))
      .map((result) => result.endpoint);
    if (invalidWebEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint: {
            in: invalidWebEndpoints,
          },
        },
      });
    }

    const expoResults =
      partitioned.expo.length > 0 ?
        await sendExpoPushNotifications(partitioned.expo, {
          title: "Напоминание о тренировке 🐕",
          body: "Пора заниматься с питомцем! Не забудьте про сегодняшнюю тренировку.",
          url: "/courses",
        })
      : {
          successCount: 0,
          failureCount: 0,
          deletedCount: 0,
          temporaryFailureCount: 0,
        };

    const rustoreResults =
      partitioned.rustore.length > 0 ?
        await sendRustorePushNotifications(partitioned.rustore, {
          title: "Напоминание о тренировке 🐕",
          body: "Пора заниматься с питомцем! Не забудьте про сегодняшнюю тренировку.",
          url: "/courses",
        })
      : {
          successCount: 0,
          failureCount: 0,
          deletedCount: 0,
          temporaryFailureCount: 0,
        };

    const successCount = webResults.successCount + expoResults.successCount + rustoreResults.successCount;
    const failureCount = webResults.failureCount + expoResults.failureCount + rustoreResults.failureCount;

    if (successCount > 0) {
      logger.success("Напоминание отправлено", {
        userId,
        timezone,
        webSuccessCount: webResults.successCount,
        webFailureCount: webResults.failureCount,
        expoSuccessCount: expoResults.successCount,
        expoFailureCount: expoResults.failureCount,
        rustoreSuccessCount: rustoreResults.successCount,
        rustoreFailureCount: rustoreResults.failureCount,
      });
      return { success: true };
    } else {
      logger.warn("Не удалось отправить напоминание", {
        userId,
        failureCount,
      });
      return { success: false, error: "All sends failed" };
    }
  } catch (error) {
    logger.error("Ошибка отправки напоминания", error as Error, { userId, timezone });
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Главная функция отправки напоминаний
 * Вызывается по расписанию (например, каждые 10 минут)
 */
export async function sendTrainingReminders(): Promise<SendResult> {
  const result: SendResult = {
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    logger.info("Начинаем проверку напоминаний о тренировках");

    // Получаем все включенные напоминания о тренировках
    const reminders = await prisma.reminder.findMany({
      where: {
        type: "training",
        enabled: true,
      },
      select: {
        id: true,
        userId: true,
        reminderTime: true,
        reminderDays: true,
        timezone: true,
        lastSentAt: true,
      },
    });

    logger.info(`Найдено ${reminders.length} активных напоминаний`);

    // Обрабатываем каждое напоминание
    for (const reminder of reminders) {
      try {
        // Получаем текущее время в timezone пользователя
        const currentTime = new Date(
          new Date().toLocaleString("en-US", { timeZone: reminder.timezone }),
        );

        // Проверяем день недели
        if (!matchesDayOfWeek(reminder.reminderDays, currentTime.getDay())) {
          logger.info("Сегодня не день для напоминания", {
            userId: reminder.userId,
            reminderDays: reminder.reminderDays,
            currentDay: currentTime.getDay(),
          });
          result.skipped++;
          continue;
        }

        // Проверяем время
        if (!matchesTime(reminder.reminderTime, currentTime)) {
          result.skipped++;
          continue;
        }

        // Проверяем, не отправляли ли уже сегодня
        if (wasAlreadySentToday(reminder.lastSentAt, currentTime)) {
          logger.info("Напоминание уже отправлено сегодня", {
            userId: reminder.userId,
            lastSentAt: reminder.lastSentAt,
          });
          result.skipped++;
          continue;
        }

        // Отправляем напоминание
        const sendResult = await sendReminderToUser(reminder.userId, reminder.timezone);

        if (sendResult.success) {
          // Обновляем lastSentAt
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: { lastSentAt: new Date() },
          });
          result.sent++;
        } else {
          result.errors++;
        }
      } catch (error) {
        logger.error("Ошибка обработки напоминания", error as Error, {
          reminderId: reminder.id,
          userId: reminder.userId,
        });
        result.errors++;
      }
    }

    logger.success("Проверка напоминаний завершена", {
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
    });
    return result;
  } catch (error) {
    logger.error("Критическая ошибка при отправке напоминаний", error as Error);
    throw error;
  }
}
