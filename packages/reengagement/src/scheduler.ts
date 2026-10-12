/**
 * Планировщик re-engagement кампаний
 * Запускается ежедневно по cron, анализирует пользователей и создает задачи
 */

import {
  scheduleReengagementInCore,
  isReengagementNotificationDue,
  getActiveReengagementCampaignForScheduling,
} from "@gafus/core/services/reengagement";
import { reengagementQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { findInactiveUsers } from "./analyzer";
import { createCampaign, checkAndCloseReturnedCampaigns } from "./campaign-manager";
import type { ReengagementJobData } from "./reengagement-types";

const logger = createWorkerLogger("reengagement-scheduler");

/**
 * Главная функция планировщика
 * Вызывается по cron расписанию (например, ежедневно в 8:00)
 */
export async function scheduleReengagementCampaigns(): Promise<{
  newCampaigns: number;
  scheduledNotifications: number;
  closedCampaigns: number;
}> {
  try {
    logger.info("Запуск планировщика re-engagement кампаний");

    const summary = await scheduleReengagementInCore({
      findInactiveUsers,
      checkAndCloseReturnedCampaigns,
      createCampaign,
      isDue: checkIfNotificationDue,
      activeCampaign: getActiveCampaign,
      dispatch: addNotificationJob,
      onCampaignError(userId, error) {
        logger.error("Ошибка создания кампании для пользователя", error as Error, { userId });
      },
    });
    logger.success("Планировщик завершил работу", {
      inactiveUsersFound: summary.inactiveUsersFound,
      newCampaignsCreated: summary.newCampaigns,
      notificationsScheduled: summary.scheduledNotifications,
      campaignsClosed: summary.closedCampaigns,
    });
    return {
      newCampaigns: summary.newCampaigns,
      scheduledNotifications: summary.scheduledNotifications,
      closedCampaigns: summary.closedCampaigns,
    };
  } catch (error) {
    logger.error("Критическая ошибка планировщика", error as Error);
    throw error;
  }
}

/**
 * Добавить задачу в очередь для отправки уведомления
 */
async function addNotificationJob(
  campaignId: string,
  userId: string,
  level: number,
): Promise<void> {
  try {
    const jobData: ReengagementJobData = {
      campaignId,
      userId,
      level: level as 1 | 2 | 3 | 4,
    };

    await reengagementQueue.add("send-reengagement-notification", jobData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: 50,
    });

    logger.info("Задача на отправку уведомления добавлена в очередь", {
      campaignId,
      userId,
      level,
    });
  } catch (error) {
    logger.error("Ошибка добавления задачи в очередь", error as Error, {
      campaignId,
      userId,
      level,
    });
    throw error;
  }
}

/**
 * Проверить, пора ли отправлять уведомление для кампании
 */
async function checkIfNotificationDue(userId: string): Promise<boolean> {
  try {
    return await isReengagementNotificationDue(userId);
  } catch (error) {
    logger.error("Ошибка проверки даты уведомления", error as Error, { userId });
    return false;
  }
}

async function getActiveCampaign(userId: string) {
  try {
    return await getActiveReengagementCampaignForScheduling(userId);
  } catch (error) {
    logger.error("Ошибка получения активной кампании", error as Error, { userId });
    return null;
  }
}

/**
 * Ручной запуск планировщика (для тестирования через админ-панель)
 */
export async function manualTriggerScheduler(): Promise<{
  success: boolean;
  result?: {
    newCampaigns: number;
    scheduledNotifications: number;
    closedCampaigns: number;
  };
  error?: string;
}> {
  try {
    logger.info("Ручной запуск планировщика");
    const result = await scheduleReengagementCampaigns();

    return {
      success: true,
      result,
    };
  } catch (error) {
    logger.error("Ошибка ручного запуска планировщика", error as Error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
