/**
 * Отправка напоминаний о тренировках
 * Проверяет настройки пользователей и отправляет push-уведомления
 */

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import { PushNotificationService } from "@gafus/webpush";
import {
  partitionPushSubscriptions,
  sendExpoPushNotifications,
  sendRustorePushNotifications,
} from "@gafus/webpush";
import { TRAINING_REMINDER_TIME_TOLERANCE_MINUTES } from "./training-reminder-schedule";

const logger = createWorkerLogger("training-reminders-sender");

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

const pushService = PushNotificationService.fromEnvironment();

interface LocalTime {
  hour: number;
  minute: number;
  /** 0=Вс, 1=Пн, ..., 6=Сб (как Date.getDay()) */
  dayOfWeek: number;
  year: number;
  month: number;
  day: number;
}

const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Возвращает текущие дату и время в указанной IANA timezone.
 * Использует Intl.DateTimeFormat.formatToParts — корректно работает
 * независимо от timezone сервера.
 */
function getUserLocalTime(timezone: string): LocalTime {
  const now = new Date();
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
  } catch {
    // Неизвестная TZ — откат на UTC
    logger.warn("Неизвестная timezone, используем UTC", { timezone });
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  // При hour12: false полночь иногда отдаётся как "24" — нормализуем
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;

  const weekdayStr = get("weekday"); // "Sun", "Mon", ...
  const dayOfWeek = WEEKDAY_EN.indexOf(weekdayStr as (typeof WEEKDAY_EN)[number]);

  if (dayOfWeek === -1) {
    logger.warn("Не удалось определить день недели", { weekdayStr, timezone });
  }

  return {
    hour,
    minute: parseInt(get("minute"), 10),
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0,
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
  };
}

/**
 * Проверяет, совпадает ли текущий день недели с выбранными днями.
 * dayOfWeek: 0=Вс, 1=Пн, ..., 6=Сб (как Date.getDay())
 * reminderDays: "1,2,3,4,5,6,7" где 1=Пн, 7=Вс
 */
function matchesDayOfWeek(reminderDays: string | null, dayOfWeek: number): boolean {
  if (!reminderDays) return true;

  // Конвертируем JS dayOfWeek → схему хранения (0→7, остальные без изменений)
  const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek;
  const selectedDays = reminderDays
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return selectedDays.includes(dayNumber.toString());
}

/**
 * Проверяет, совпадает ли текущее время с временем напоминания.
 * Допуск синхронизирован с интервалом крона — см. training-reminder-schedule.ts.
 */
function matchesTime(reminderTime: string, hour: number, minute: number): boolean {
  const [rHours, rMinutes] = reminderTime.split(":").map(Number);
  if (isNaN(rHours) || isNaN(rMinutes)) return false;
  const reminderTotal = rHours * 60 + rMinutes;
  const currentTotal = hour * 60 + minute;
  return (
    Math.abs(reminderTotal - currentTotal) <= TRAINING_REMINDER_TIME_TOLERANCE_MINUTES
  );
}

/**
 * Проверяет, не отправляли ли уже сегодня напоминание.
 * Сравнение ведётся в timezone пользователя, а не сервера.
 */
function wasAlreadySentToday(
  lastSentAt: Date | null,
  timezone: string,
  localYear: number,
  localMonth: number,
  localDay: number,
): boolean {
  if (!lastSentAt) return false;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(lastSentAt);
  } catch {
    return false;
  }

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  return (
    get("year") === localYear &&
    get("month") === localMonth &&
    get("day") === localDay
  );
}

/**
 * Отправляет напоминание о тренировке пользователю
 */
async function sendReminderToUser(
  userId: string,
  timezone: string,
  reminderName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      logger.warn("У пользователя нет push-подписок", { userId });
      return { success: false, error: "No subscriptions" };
    }

    const payload = JSON.stringify({
      title: "Напоминание о тренировке",
      body: reminderName,
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
      : { results: [], successCount: 0, failureCount: 0 };

    const invalidWebEndpoints = webResults.results
      .filter(
        (result) =>
          !result.success && PushNotificationService.shouldDeleteSubscription(result.error),
      )
      .map((result) => result.endpoint);

    if (invalidWebEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: invalidWebEndpoints } },
      });
    }

    const expoResults =
      partitioned.expo.length > 0 ?
        await sendExpoPushNotifications(partitioned.expo, {
          title: "Напоминание о тренировке",
          body: reminderName,
          url: "/courses",
        })
      : { successCount: 0, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0 };

    const rustoreResults =
      partitioned.rustore.length > 0 ?
        await sendRustorePushNotifications(partitioned.rustore, {
          title: "Напоминание о тренировке",
          body: reminderName,
          url: "/courses",
        })
      : { successCount: 0, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0 };

    const successCount =
      webResults.successCount + expoResults.successCount + rustoreResults.successCount;
    const failureCount =
      webResults.failureCount + expoResults.failureCount + rustoreResults.failureCount;

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
      logger.warn("Не удалось отправить напоминание", { userId, failureCount });
      return { success: false, error: "All sends failed" };
    }
  } catch (error) {
    logger.error("Ошибка отправки напоминания", error as Error, { userId, timezone });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Сбой при отправке напоминаний",
    };
  }
}

/**
 * Главная функция отправки напоминаний.
 * Вызывается по расписанию (см. cron-scheduler, training-reminder-schedule).
 */
export async function sendTrainingReminders(): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, errors: 0 };

  try {
    logger.info("Начинаем проверку напоминаний о тренировках");

    const reminders = await prisma.reminder.findMany({
      where: { type: "training", enabled: true },
      select: {
        id: true,
        userId: true,
        name: true,
        reminderTime: true,
        reminderDays: true,
        timezone: true,
        lastSentAt: true,
      },
    });

    logger.info(`Найдено ${reminders.length} активных напоминаний`);

    for (const reminder of reminders) {
      try {
        // Получаем текущие дату и время в TZ пользователя через Intl
        const local = getUserLocalTime(reminder.timezone);

        // Проверяем день недели
        if (!matchesDayOfWeek(reminder.reminderDays, local.dayOfWeek)) {
          logger.info("Сегодня не день для напоминания", {
            userId: reminder.userId,
            reminderDays: reminder.reminderDays,
            currentDayOfWeek: local.dayOfWeek,
          });
          result.skipped++;
          continue;
        }

        // Проверяем время (допуск — TRAINING_REMINDER_TIME_TOLERANCE_MINUTES)
        if (!matchesTime(reminder.reminderTime, local.hour, local.minute)) {
          result.skipped++;
          continue;
        }

        // Проверяем дедуп «уже сегодня» в TZ пользователя
        if (
          wasAlreadySentToday(
            reminder.lastSentAt,
            reminder.timezone,
            local.year,
            local.month,
            local.day,
          )
        ) {
          logger.info("Напоминание уже отправлено сегодня", {
            userId: reminder.userId,
            lastSentAt: reminder.lastSentAt,
          });
          result.skipped++;
          continue;
        }

        const sendResult = await sendReminderToUser(
          reminder.userId,
          reminder.timezone,
          reminder.name,
        );

        if (sendResult.success) {
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
