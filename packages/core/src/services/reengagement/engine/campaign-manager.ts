/**
 * Менеджер re-engagement кампаний
 * Создание, обновление и закрытие кампаний
 */

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import type { NotificationLevel, CampaignData } from "./reengagement-types";

const logger = createWorkerLogger("campaign-manager");

/**
 * Интервалы между уведомлениями (в днях)
 */
const NOTIFICATION_INTERVALS = {
  1: 5, // Уровень 1: через 5 дней после неактивности
  2: 12, // Уровень 2: через 12 дней
  3: 20, // Уровень 3: через 20 дней
  4: 30, // Уровень 4: через 30 дней
};

/**
 * Создать новую кампанию для пользователя
 */
export async function createCampaign(userId: string, lastActivityDate: Date): Promise<string> {
  try {
    // Рассчитать дату первого уведомления
    const nextNotificationDate = calculateNextNotificationDate(1, lastActivityDate);

    const campaign = await prisma.reengagementCampaign.create({
      data: {
        userId,
        lastActivityDate,
        campaignStartDate: new Date(),
        currentLevel: 1,
        nextNotificationDate,
        isActive: true,
      },
    });

    logger.info("Создана новая re-engagement кампания", {
      campaignId: campaign.id,
      userId,
      nextNotificationDate,
    });

    return campaign.id;
  } catch (error) {
    logger.error("Ошибка создания кампании", error as Error, { userId });
    throw error;
  }
}

/**
 * Обновить кампанию после отправки уведомления
 */
export async function updateCampaignAfterSend(
  campaignId: string,
  notificationId: string,
  successCount: number,
  failedCount: number,
): Promise<void> {
  try {
    // Получить текущую кампанию
    const campaign = await prisma.reengagementCampaign.findUnique({
      where: { id: campaignId },
      select: {
        currentLevel: true,
        lastActivityDate: true,
        totalNotificationsSent: true,
      },
    });

    if (!campaign) {
      logger.warn("Кампания не найдена для обновления", { campaignId });
      return;
    }

    const currentLevel = campaign.currentLevel as NotificationLevel;
    const nextLevel = (currentLevel + 1) as NotificationLevel;

    // Проверяем, не последнее ли это уведомление
    const isLastLevel = currentLevel >= 4;

    // Рассчитать дату следующего уведомления
    const nextNotificationDate = isLastLevel
      ? null
      : calculateNextNotificationDate(nextLevel, campaign.lastActivityDate);

    // Обновить кампанию
    await prisma.reengagementCampaign.update({
      where: { id: campaignId },
      data: {
        currentLevel: isLastLevel ? currentLevel : nextLevel,
        lastNotificationSent: new Date(),
        nextNotificationDate,
        totalNotificationsSent: campaign.totalNotificationsSent + 1,
        isActive: !isLastLevel, // Деактивировать, если это было последнее уведомление
      },
    });

    // Обновить статус уведомления
    await prisma.reengagementNotification.update({
      where: { id: notificationId },
      data: {
        sent: true,
        sentAt: new Date(),
        successCount,
        failedCount,
      },
    });

    logger.info("Кампания обновлена после отправки", {
      campaignId,
      nextLevel: isLastLevel ? null : nextLevel,
      nextNotificationDate,
      isActive: !isLastLevel,
    });
  } catch (error) {
    logger.error("Ошибка обновления кампании", error as Error, { campaignId });
    throw error;
  }
}

/**
 * Закрыть кампанию (пользователь вернулся или отписался)
 */
export async function closeCampaign(campaignId: string, returned: boolean = false): Promise<void> {
  try {
    await prisma.reengagementCampaign.update({
      where: { id: campaignId },
      data: {
        isActive: false,
        returned,
        returnedAt: returned ? new Date() : null,
      },
    });

    logger.info("Кампания закрыта", { campaignId, returned });
  } catch (error) {
    logger.error("Ошибка закрытия кампании", error as Error, { campaignId });
    throw error;
  }
}

/**
 * Получить данные кампании для обработки
 */
export async function getCampaignData(campaignId: string): Promise<CampaignData | null> {
  try {
    const campaign = await prisma.reengagementCampaign.findUnique({
      where: { id: campaignId },
      include: {
        notifications: {
          select: {
            variantId: true,
          },
        },
      },
    });

    if (!campaign) {
      return null;
    }

    // Собрать ID отправленных вариантов
    const sentVariantIds = campaign.notifications.map((n) => n.variantId);

    return {
      id: campaign.id,
      userId: campaign.userId,
      currentLevel: campaign.currentLevel as NotificationLevel,
      sentVariantIds,
      lastActivityDate: campaign.lastActivityDate,
    };
  } catch (error) {
    logger.error("Ошибка получения данных кампании", error as Error, { campaignId });
    return null;
  }
}

/**
 * Отписать пользователя от re-engagement уведомлений
 */
export async function unsubscribeUser(userId: string): Promise<void> {
  try {
    // Создать или обновить настройки
    await prisma.reengagementSettings.upsert({
      where: { userId },
      create: {
        userId,
        enabled: false,
        unsubscribedAt: new Date(),
      },
      update: {
        enabled: false,
        unsubscribedAt: new Date(),
      },
    });

    // Закрыть все активные кампании
    await prisma.reengagementCampaign.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
        unsubscribed: true,
      },
    });

    logger.info("Пользователь отписан от re-engagement", { userId });
  } catch (error) {
    logger.error("Ошибка отписки пользователя", error as Error, { userId });
    throw error;
  }
}

/**
 * Рассчитать дату следующего уведомления
 */
function calculateNextNotificationDate(level: NotificationLevel, lastActivityDate: Date): Date {
  const interval = NOTIFICATION_INTERVALS[level] || 5;
  const nextDate = new Date(lastActivityDate);
  nextDate.setDate(nextDate.getDate() + interval);
  return nextDate;
}

/**
 * Создать запись уведомления в БД (до отправки)
 */
export async function createNotificationRecord(
  campaignId: string,
  level: NotificationLevel,
  messageType: string,
  variantId: string,
  title: string,
  body: string,
  url: string,
): Promise<string> {
  try {
    const notification = await prisma.reengagementNotification.create({
      data: {
        campaignId,
        level,
        messageType,
        variantId,
        title,
        body,
        url,
        sent: false,
      },
    });

    return notification.id;
  } catch (error) {
    logger.error("Ошибка создания записи уведомления", error as Error, { campaignId });
    throw error;
  }
}

/**
 * Проверить и закрыть кампании вернувшихся пользователей
 */
export async function checkAndCloseReturnedCampaigns(): Promise<number> {
  try {
    // Получить все активные кампании
    const activeCampaigns = await prisma.reengagementCampaign.findMany({
      where: {
        isActive: true,
        returned: false,
      },
      select: {
        id: true,
        userId: true,
        campaignStartDate: true,
      },
    });

    let closedCount = 0;

    for (const campaign of activeCampaigns) {
      // Проверить активность с момента начала кампании
      const hasActivity = await prisma.userStep.findFirst({
        where: {
          userTraining: {
            userId: campaign.userId,
          },
          status: "COMPLETED",
          updatedAt: {
            gte: campaign.campaignStartDate,
          },
        },
      });

      if (hasActivity) {
        await closeCampaign(campaign.id, true);
        closedCount++;
      }
    }

    if (closedCount > 0) {
      logger.info(`Закрыто кампаний вернувшихся пользователей: ${closedCount}`);
    }

    return closedCount;
  } catch (error) {
    logger.error("Ошибка проверки вернувшихся пользователей", error as Error);
    return 0;
  }
}
