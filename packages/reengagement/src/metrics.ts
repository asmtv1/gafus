/**
 * Метрики и аналитика re-engagement кампаний
 */

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("reengagement-metrics");

/**
 * Записать ежедневные метрики
 */
export async function recordDailyMetrics(): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Активные кампании
    const totalActive = await prisma.reengagementCampaign.count({
      where: { isActive: true },
    });

    // Отправлено за день
    const totalSent = await prisma.reengagementNotification.count({
      where: {
        sentAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Вернулось пользователей
    const totalReturned = await prisma.reengagementCampaign.count({
      where: {
        returned: true,
        returnedAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Метрики по уровням
    const levelMetrics = await getLevelMetrics(today, tomorrow);

    // Метрики по типам
    const typeMetrics = await getTypeMetrics(today, tomorrow);

    // Эффективность
    const effectiveness = await calculateEffectiveness(today, tomorrow);

    // Сохранить метрики
    await prisma.reengagementMetrics.create({
      data: {
        date: today,
        totalActive,
        totalSent,
        totalReturned,
        ...levelMetrics,
        ...typeMetrics,
        ...effectiveness,
      },
    });

    logger.info("Ежедневные метрики записаны", { date: today });
  } catch (error) {
    logger.error("Ошибка записи метрик", error as Error);
  }
}

/**
 * Получить метрики по уровням
 */
async function getLevelMetrics(start: Date, end: Date) {
  const levels = [1, 2, 3, 4];
  const metrics: Record<string, number> = {};

  for (const level of levels) {
    const count = await prisma.reengagementNotification.count({
      where: {
        level,
        sentAt: {
          gte: start,
          lt: end,
        },
      },
    });

    metrics[`level${level}Sent`] = count;
  }

  return metrics;
}

/**
 * Получить метрики по типам сообщений
 */
async function getTypeMetrics(start: Date, end: Date) {
  const types = ["emotional", "educational", "motivational", "mixed"];
  const metrics: Record<string, number> = {};

  for (const type of types) {
    const count = await prisma.reengagementNotification.count({
      where: {
        messageType: type,
        sentAt: {
          gte: start,
          lt: end,
        },
      },
    });

    metrics[`${type}Sent`] = count;
  }

  return metrics;
}

/**
 * Рассчитать эффективность
 */
async function calculateEffectiveness(start: Date, end: Date) {
  // Открытия (пока не реализовано, будет добавлено позже)
  const openRate = null;

  // Клики
  const totalSent = await prisma.reengagementNotification.count({
    where: {
      sentAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const totalClicked = await prisma.reengagementNotification.count({
    where: {
      clicked: true,
      clickedAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : null;

  // Возвраты
  const totalReturned = await prisma.reengagementCampaign.count({
    where: {
      returned: true,
      returnedAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const returnRate = totalSent > 0 ? (totalReturned / totalSent) * 100 : null;

  return {
    openRate,
    clickRate,
    returnRate,
  };
}
