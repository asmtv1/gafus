/**
 * Планировщик re-engagement кампаний
 * Запускается ежедневно по cron, анализирует пользователей и создает задачи
 */

import { prisma } from '@gafus/prisma';
import { reengagementQueue } from '@gafus/queues';
import { createWorkerLogger } from '@gafus/logger';
import { findInactiveUsers } from './analyzer';
import { createCampaign, checkAndCloseReturnedCampaigns } from './campaign-manager';
import type { ReengagementJobData } from './reengagement-types';

const logger = createWorkerLogger('reengagement-scheduler');

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
    logger.info('Запуск планировщика re-engagement кампаний');

    // 1. Проверить и закрыть кампании вернувшихся пользователей
    const closedCampaigns = await checkAndCloseReturnedCampaigns();

    // 2. Найти неактивных пользователей
    const inactiveUsers = await findInactiveUsers();
    
    let newCampaigns = 0;
    let scheduledNotifications = 0;

    // 3. Обработать каждого неактивного пользователя
    for (const user of inactiveUsers) {
      if (!user.hasActiveCampaign) {
        // Создать новую кампанию
        try {
          const campaignId = await createCampaign(user.userId, user.lastActivityDate);
          newCampaigns++;

          // Добавить задачу для отправки первого уведомления
          await addNotificationJob(campaignId, user.userId, 1);
          scheduledNotifications++;
        } catch (error) {
          logger.error('Ошибка создания кампании для пользователя', error as Error, {
            userId: user.userId
          });
        }
      } else {
        // У пользователя есть активная кампания
        // Проверяем, пора ли отправлять следующее уведомление
        const shouldSend = await checkIfNotificationDue(user.userId);
        
        if (shouldSend) {
          const campaign = await getActiveCampaign(user.userId);
          
          if (campaign) {
            await addNotificationJob(campaign.id, user.userId, campaign.currentLevel);
            scheduledNotifications++;
          }
        }
      }
    }

    // 4. Логирование результатов
    logger.success('Планировщик завершил работу', {
      inactiveUsersFound: inactiveUsers.length,
      newCampaignsCreated: newCampaigns,
      notificationsScheduled: scheduledNotifications,
      campaignsClosed: closedCampaigns
    });

    return {
      newCampaigns,
      scheduledNotifications,
      closedCampaigns
    };
  } catch (error) {
    logger.error('Критическая ошибка планировщика', error as Error);
    throw error;
  }
}

/**
 * Добавить задачу в очередь для отправки уведомления
 */
async function addNotificationJob(
  campaignId: string,
  userId: string,
  level: number
): Promise<void> {
  try {
    const jobData: ReengagementJobData = {
      campaignId,
      userId,
      level: level as 1 | 2 | 3 | 4
    };

    await reengagementQueue.add('send-reengagement-notification', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: 50
    });

    logger.info('Задача на отправку уведомления добавлена в очередь', {
      campaignId,
      userId,
      level
    });
  } catch (error) {
    logger.error('Ошибка добавления задачи в очередь', error as Error, {
      campaignId,
      userId,
      level
    });
    throw error;
  }
}

/**
 * Проверить, пора ли отправлять уведомление для кампании
 */
async function checkIfNotificationDue(userId: string): Promise<boolean> {
  try {
    const campaign = await prisma.reengagementCampaign.findFirst({
      where: {
        userId,
        isActive: true
      },
      select: {
        nextNotificationDate: true
      }
    });

    if (!campaign || !campaign.nextNotificationDate) {
      return false;
    }

    // Проверяем, наступила ли дата следующего уведомления
    const now = new Date();
    return campaign.nextNotificationDate <= now;
  } catch (error) {
    logger.error('Ошибка проверки даты уведомления', error as Error, { userId });
    return false;
  }
}

/**
 * Получить активную кампанию пользователя
 */
async function getActiveCampaign(userId: string) {
  try {
    return await prisma.reengagementCampaign.findFirst({
      where: {
        userId,
        isActive: true
      },
      select: {
        id: true,
        currentLevel: true
      }
    });
  } catch (error) {
    logger.error('Ошибка получения активной кампании', error as Error, { userId });
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
    logger.info('Ручной запуск планировщика');
    const result = await scheduleReengagementCampaigns();
    
    return {
      success: true,
      result
    };
  } catch (error) {
    logger.error('Ошибка ручного запуска планировщика', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

