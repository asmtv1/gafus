/**
 * Отправка напоминаний о тренировках
 * Проверяет настройки пользователей и отправляет push-уведомления
 */

import { createWorkerLogger } from "@gafus/logger";
import { PushNotificationService } from "@gafus/webpush";
import {
  partitionPushSubscriptions,
  sendExpoPushNotifications,
  sendRustorePushNotifications,
} from "@gafus/webpush";
import {
  shouldSendTrainingReminder,
  claimDailyTrainingReminderDelivery,
  acknowledgeDailyTrainingReminderDelivery,
  releaseDailyTrainingReminderDelivery,
  listRetryableTrainingReminderCandidates,
  listActiveTrainingReminderCandidates,
  getTrainingReminderPushSubscriptions,
  removeInvalidTrainingReminderEndpoints,
} from "@gafus/core/services/reminders";

const logger = createWorkerLogger("training-reminders-sender");

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

// Native Expo/RuStore deliveries do not require WebPush VAPID credentials.
// Do not make the entire worker bootstrap fail just because browser push is
// unconfigured in an isolated development environment.
let webPushService: PushNotificationService | null = null;
function getWebPushService(): PushNotificationService {
  webPushService ??= PushNotificationService.fromEnvironment();
  return webPushService;
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
    const subscriptions = await getTrainingReminderPushSubscriptions(userId);

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

    let webResults: {
      results: { success: boolean; error?: unknown; endpoint: string }[];
      successCount: number;
      failureCount: number;
    } = { results: [], successCount: 0, failureCount: 0 };
    if (partitioned.web.length > 0) {
      try {
        webResults = await getWebPushService().sendNotifications(partitioned.web, payload);
      } catch (error) {
        // Browser-push configuration or transport failures must not suppress
        // the independent Expo/RuStore transport. No endpoint is removed on
        // ambiguous failures; only provider-confirmed invalid ones are purged.
        logger.error("Не удалось отправить WebPush", error as Error);
        webResults.failureCount = partitioned.web.length;
      }
    }

    const invalidWebEndpoints = webResults.results
      .filter(
        (result) =>
          !result.success && PushNotificationService.shouldDeleteSubscription(result.error),
      )
      .map((result) => result.endpoint);

    if (invalidWebEndpoints.length > 0) {
      await removeInvalidTrainingReminderEndpoints(invalidWebEndpoints);
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

    const [active, retryable] = await Promise.all([
      listActiveTrainingReminderCandidates(),
      listRetryableTrainingReminderCandidates(new Date()),
    ]);
    const retryableIds = new Set(retryable.map(reminder => reminder.id));
    const unique = new Map([...active, ...retryable].map(reminder => [reminder.id, reminder]));
    const reminders = [...unique.values()];

    logger.info(`Найдено ${reminders.length} активных напоминаний`);

    for (const reminder of reminders) {
      let leaseToken: string | null = null;
      let claimedAt: Date | null = null;
      try {
        const now = new Date();
        if (!retryableIds.has(reminder.id) && !shouldSendTrainingReminder(reminder, now)) {
          result.skipped++;
          continue;
        }
        // Only one live lease per reminder and local calendar day.
        // Expired leases can be reclaimed after worker crashes.
        claimedAt = now;
        leaseToken = await claimDailyTrainingReminderDelivery({
          reminderId: reminder.id,
          userId: reminder.userId,
          timezone: reminder.timezone,
          now,
        });
        if (!leaseToken) {
          result.skipped++;
          continue;
        }

        const sendResult = await sendReminderToUser(
          reminder.userId,
          reminder.timezone,
          reminder.name,
        );

        if (sendResult.success) {
          const saved = await acknowledgeDailyTrainingReminderDelivery({
            reminderId: reminder.id, timezone: reminder.timezone,
            token: leaseToken, claimedAt, now: new Date(),
          });
          if (saved) result.sent++;
          else result.errors++;
        } else {
          await releaseDailyTrainingReminderDelivery({
            reminderId: reminder.id, timezone: reminder.timezone,
            token: leaseToken, claimedAt, now: new Date(),
          });
          result.errors++;
        }
      } catch (error) {
        if (leaseToken && claimedAt) {
          try {
            await releaseDailyTrainingReminderDelivery({
              reminderId: reminder.id, timezone: reminder.timezone,
              token: leaseToken, claimedAt, now: new Date(),
            });
          } catch (releaseError) {
            logger.error("Не удалось освободить аренду напоминания", releaseError as Error);
          }
        }
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
