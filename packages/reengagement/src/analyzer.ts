/**
 * Анализатор активности пользователей
 * Определяет неактивных пользователей для re-engagement кампаний
 */

import { prisma } from '@gafus/prisma';
import { createWorkerLogger } from '@gafus/logger';
import type { InactiveUser } from './reengagement-types';

const logger = createWorkerLogger('reengagement-analyzer');

/**
 * Критерии неактивности
 */
const INACTIVITY_CRITERIA = {
  MIN_DAYS_INACTIVE: 5, // Минимум 5 дней без активности
  MIN_COMPLETED_STEPS: 2, // Минимум 2 завершенных шага в прошлом
  MAX_ANALYSIS_DAYS: 60 // Анализируем только за последние 60 дней
};

/**
 * Найти всех неактивных пользователей
 */
export async function findInactiveUsers(): Promise<InactiveUser[]> {
  try {
    logger.info('Начало анализа неактивных пользователей');

    // Дата для фильтрации
    const analysisStartDate = new Date();
    analysisStartDate.setDate(analysisStartDate.getDate() - INACTIVITY_CRITERIA.MAX_ANALYSIS_DAYS);

    // 1. Получить пользователей с активностью в последние 60 дней
    const usersWithActivity = await prisma.user.findMany({
      where: {
        // Есть хотя бы одна завершенная тренировка
        userTrainings: {
          some: {
            steps: {
              some: {
                status: 'COMPLETED',
                updatedAt: {
                  gte: analysisStartDate
                }
              }
            }
          }
        }
      },
      select: {
        id: true,
        // Последний завершенный шаг
        userTrainings: {
          select: {
            steps: {
              where: {
                status: 'COMPLETED'
              },
              orderBy: {
                updatedAt: 'desc'
              },
              take: 1
            }
          }
        },
        // Активная кампания
        reengagementCampaigns: {
          where: {
            isActive: true
          },
          take: 1
        },
        // Настройки
        reengagementSettings: {
          select: {
            enabled: true,
            unsubscribedAt: true
          }
        }
      }
    });

    logger.info(`Найдено пользователей с активностью: ${usersWithActivity.length}`);

    // 2. Фильтровать по критериям неактивности
    const inactiveUsers: InactiveUser[] = [];

    for (const user of usersWithActivity) {
      // Найти последнюю активность
      const lastActivity = findLastActivity(user.userTrainings);
      
      if (!lastActivity) {
        continue; // Нет активности - пропускаем
      }

      const daysSinceActivity = calculateDaysSince(lastActivity);

      // Проверить критерии
      if (daysSinceActivity < INACTIVITY_CRITERIA.MIN_DAYS_INACTIVE) {
        continue; // Еще не неактивен
      }

      // Проверить количество завершенных шагов
      const totalCompletions = await countUserCompletions(user.id);
      
      if (totalCompletions < INACTIVITY_CRITERIA.MIN_COMPLETED_STEPS) {
        continue; // Недостаточно активности в прошлом
      }

      // Проверить настройки
      const settings = user.reengagementSettings;
      if (settings && (!settings.enabled || settings.unsubscribedAt)) {
        continue; // Отключено или отписался
      }

      // Проверить наличие активной кампании
      const hasActiveCampaign = user.reengagementCampaigns.length > 0;

      inactiveUsers.push({
        userId: user.id,
        lastActivityDate: lastActivity,
        daysSinceActivity,
        totalCompletions,
        hasActiveCampaign
      });
    }

    logger.info(`Найдено неактивных пользователей: ${inactiveUsers.length}`);

    return inactiveUsers;
  } catch (error) {
    logger.error('Ошибка анализа неактивных пользователей', error as Error);
    throw error;
  }
}

/**
 * Найти последнюю активность пользователя
 */
function findLastActivity(
  userTrainings: Array<{
    steps: Array<{ updatedAt: Date }>;
  }>
): Date | null {
  let latestDate: Date | null = null;

  for (const training of userTrainings) {
    for (const step of training.steps) {
      if (!latestDate || step.updatedAt > latestDate) {
        latestDate = step.updatedAt;
      }
    }
  }

  return latestDate;
}

/**
 * Рассчитать количество дней с указанной даты
 */
function calculateDaysSince(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Подсчитать общее количество завершенных шагов пользователя
 */
async function countUserCompletions(userId: string): Promise<number> {
  try {
    const count = await prisma.userStep.count({
      where: {
        userTraining: {
          userId
        },
        status: 'COMPLETED'
      }
    });

    return count;
  } catch (error) {
    logger.error('Ошибка подсчета завершенных шагов', error as Error, { userId });
    return 0;
  }
}

/**
 * Проверить, вернулся ли пользователь (для закрытия кампании)
 */
export async function checkUserReturned(
  userId: string,
  campaignStartDate: Date
): Promise<boolean> {
  try {
    // Есть ли активность с момента начала кампании?
    const activitySinceCampaign = await prisma.userStep.findFirst({
      where: {
        userTraining: {
          userId
        },
        status: 'COMPLETED',
        updatedAt: {
          gte: campaignStartDate
        }
      }
    });

    return activitySinceCampaign !== null;
  } catch (error) {
    logger.error('Ошибка проверки возврата пользователя', error as Error, { userId });
    return false;
  }
}

/**
 * Получить дату последней активности пользователя
 */
export async function getLastActivityDate(userId: string): Promise<Date | null> {
  try {
    const lastStep = await prisma.userStep.findFirst({
      where: {
        userTraining: {
          userId
        },
        status: 'COMPLETED'
      },
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        updatedAt: true
      }
    });

    return lastStep?.updatedAt || null;
  } catch (error) {
    logger.error('Ошибка получения последней активности', error as Error, { userId });
    return null;
  }
}

