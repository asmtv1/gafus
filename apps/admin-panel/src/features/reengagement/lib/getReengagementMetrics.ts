"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('get-reengagement-metrics');

/**
 * Типы для метрик
 */
export interface ReengagementMetrics {
  overview: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalNotificationsSent: number;
    clickedNotifications: number;
    returnedUsers: number;
    unsubscribedUsers: number;
    clickRate: number;
    returnRate: number;
  };
  byLevel: {
    level1: MetricsByLevel;
    level2: MetricsByLevel;
    level3: MetricsByLevel;
  };
  byType: {
    skillMaintenance: MetricsByType;
    weMissYou: MetricsByType;
    dogDevelopment: MetricsByType;
  };
  recentCampaigns: RecentCampaign[];
}

interface MetricsByLevel {
  sent: number;
  clicked: number;
  clickRate: number;
}

interface MetricsByType {
  sent: number;
  clicked: number;
  clickRate: number;
}

interface RecentCampaign {
  id: string;
  userId: string;
  userName: string | null;
  campaignStartDate: Date;
  level: number;
  notificationsSent: number;
  clicked: number;
  returned: boolean;
  unsubscribed: boolean;
  isActive: boolean;
}

/**
 * Получить метрики re-engagement системы (только для ADMIN)
 */
export async function getReengagementMetrics(): Promise<{
  success: boolean;
  data?: ReengagementMetrics;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    // Проверить роль ADMIN
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Недостаточно прав доступа"
      };
    }

    // 1. Общая статистика
    const [
      totalCampaigns,
      activeCampaigns,
      totalNotifications,
      clickedNotifications,
      returnedCampaigns,
      unsubscribedCampaigns
    ] = await Promise.all([
      prisma.reengagementCampaign.count(),
      prisma.reengagementCampaign.count({ where: { isActive: true } }),
      prisma.reengagementNotification.count(),
      prisma.reengagementNotification.count({ where: { clicked: true } }),
      prisma.reengagementCampaign.count({ where: { returned: true } }),
      prisma.reengagementCampaign.count({ where: { unsubscribed: true } })
    ]);

    const clickRate = totalNotifications > 0 
      ? (clickedNotifications / totalNotifications) * 100 
      : 0;
    
    const returnRate = totalCampaigns > 0 
      ? (returnedCampaigns / totalCampaigns) * 100 
      : 0;

    // 2. Статистика по уровням
    const levelMetrics = await Promise.all([
      prisma.reengagementNotification.groupBy({
        by: ['level'],
        _count: { id: true }
      }),
      prisma.reengagementNotification.groupBy({
        by: ['level'],
        where: { clicked: true },
        _count: { id: true }
      })
    ]);

    const byLevel = {
      level1: calculateLevelMetrics(levelMetrics[0], levelMetrics[1], 1),
      level2: calculateLevelMetrics(levelMetrics[0], levelMetrics[1], 2),
      level3: calculateLevelMetrics(levelMetrics[0], levelMetrics[1], 3)
    };

    // 3. Статистика по типам сообщений
    const typeMetrics = await Promise.all([
      prisma.reengagementNotification.groupBy({
        by: ['messageType'],
        _count: { id: true }
      }),
      prisma.reengagementNotification.groupBy({
        by: ['messageType'],
        where: { clicked: true },
        _count: { id: true }
      })
    ]);

    const byType = {
      skillMaintenance: calculateTypeMetrics(typeMetrics[0], typeMetrics[1], 'skill-maintenance'),
      weMissYou: calculateTypeMetrics(typeMetrics[0], typeMetrics[1], 'we-miss-you'),
      dogDevelopment: calculateTypeMetrics(typeMetrics[0], typeMetrics[1], 'dog-development')
    };

    // 4. Последние кампании
    const recentCampaignsData = await prisma.reengagementCampaign.findMany({
      take: 20,
      orderBy: { campaignStartDate: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            profile: {
              select: {
                fullName: true
              }
            }
          }
        },
        _count: {
          select: {
            notifications: true
          }
        },
        notifications: {
          where: { clicked: true },
          select: { id: true }
        }
      }
    });

    const recentCampaigns: RecentCampaign[] = recentCampaignsData.map(campaign => ({
      id: campaign.id,
      userId: campaign.userId,
      userName: campaign.user.profile?.fullName || campaign.user.username,
      campaignStartDate: campaign.campaignStartDate,
      level: campaign.currentLevel,
      notificationsSent: campaign._count.notifications,
      clicked: campaign.notifications.length,
      returned: campaign.returned,
      unsubscribed: campaign.unsubscribed,
      isActive: campaign.isActive
    }));

    logger.info('Re-engagement метрики получены', {
      totalCampaigns,
      activeCampaigns,
      totalNotifications,
      clickedNotifications,
      clickRate: clickRate.toFixed(2)
    });

    return {
      success: true,
      data: {
        overview: {
          totalCampaigns,
          activeCampaigns,
          totalNotificationsSent: totalNotifications,
          clickedNotifications,
          returnedUsers: returnedCampaigns,
          unsubscribedUsers: unsubscribedCampaigns,
          clickRate: Math.round(clickRate * 100) / 100,
          returnRate: Math.round(returnRate * 100) / 100
        },
        byLevel,
        byType,
        recentCampaigns
      }
    };
  } catch (error) {
    logger.error('Ошибка получения метрик re-engagement', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

/**
 * Вспомогательные функции для расчета метрик
 */
function calculateLevelMetrics(
  allMetrics: { level: number; _count: { id: number } }[],
  clickedMetrics: { level: number; _count: { id: number } }[],
  level: number
): MetricsByLevel {
  const metric = allMetrics.find(m => m.level === level);
  const clickedMetric = clickedMetrics.find(m => m.level === level);
  
  if (!metric) {
    return { sent: 0, clicked: 0, clickRate: 0 };
  }

  const sent = metric._count.id;
  const clicked = clickedMetric?._count.id || 0;
  const clickRate = sent > 0 ? (clicked / sent) * 100 : 0;

  return {
    sent,
    clicked,
    clickRate: Math.round(clickRate * 100) / 100
  };
}

function calculateTypeMetrics(
  allMetrics: { messageType: string; _count: { id: number } }[],
  clickedMetrics: { messageType: string; _count: { id: number } }[],
  type: string
): MetricsByType {
  const metric = allMetrics.find(m => m.messageType === type);
  const clickedMetric = clickedMetrics.find(m => m.messageType === type);
  
  if (!metric) {
    return { sent: 0, clicked: 0, clickRate: 0 };
  }

  const sent = metric._count.id;
  const clicked = clickedMetric?._count.id || 0;
  const clickRate = sent > 0 ? (clicked / sent) * 100 : 0;

  return {
    sent,
    clicked,
    clickRate: Math.round(clickRate * 100) / 100
  };
}

