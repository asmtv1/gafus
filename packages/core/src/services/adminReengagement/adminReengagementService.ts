import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type {
  MetricsByLevel,
  MetricsByType,
  RecentCampaign,
  ReengagementMetrics,
} from "./types";

const logger = createWebLogger("admin-reengagement-service");

function calculateLevelMetrics(
  allMetrics: { level: number; _count: { id: number } }[],
  clickedMetrics: { level: number; _count: { id: number } }[],
  level: number,
): MetricsByLevel {
  const metric = allMetrics.find((m) => m.level === level);
  const clickedMetric = clickedMetrics.find((m) => m.level === level);

  if (!metric) {
    return { sent: 0, clicked: 0, clickRate: 0 };
  }

  const sent = metric._count.id;
  const clicked = clickedMetric?._count.id || 0;
  const clickRate = sent > 0 ? (clicked / sent) * 100 : 0;

  return {
    sent,
    clicked,
    clickRate: Math.round(clickRate * 100) / 100,
  };
}

function calculateTypeMetrics(
  allMetrics: { messageType: string; _count: { id: number } }[],
  clickedMetrics: { messageType: string; _count: { id: number } }[],
  type: string,
): MetricsByType {
  const metric = allMetrics.find((m) => m.messageType === type);
  const clickedMetric = clickedMetrics.find((m) => m.messageType === type);

  if (!metric) {
    return { sent: 0, clicked: 0, clickRate: 0 };
  }

  const sent = metric._count.id;
  const clicked = clickedMetric?._count.id || 0;
  const clickRate = sent > 0 ? (clicked / sent) * 100 : 0;

  return {
    sent,
    clicked,
    clickRate: Math.round(clickRate * 100) / 100,
  };
}

export async function getReengagementMetrics(): Promise<
  { success: true; data: ReengagementMetrics } | { success: false; error: string }
> {
  try {
    const [
      totalCampaigns,
      activeCampaigns,
      totalNotifications,
      clickedNotifications,
      returnedCampaigns,
      unsubscribedCampaigns,
      levelMetricsAll,
      levelMetricsClicked,
      typeMetricsAll,
      typeMetricsClicked,
      recentCampaignsData,
    ] = await Promise.all([
      prisma.reengagementCampaign.count(),
      prisma.reengagementCampaign.count({ where: { isActive: true } }),
      prisma.reengagementNotification.count(),
      prisma.reengagementNotification.count({ where: { clicked: true } }),
      prisma.reengagementCampaign.count({ where: { returned: true } }),
      prisma.reengagementCampaign.count({ where: { unsubscribed: true } }),
      prisma.reengagementNotification.groupBy({
        by: ["level"],
        _count: { id: true },
      }),
      prisma.reengagementNotification.groupBy({
        by: ["level"],
        where: { clicked: true },
        _count: { id: true },
      }),
      prisma.reengagementNotification.groupBy({
        by: ["messageType"],
        _count: { id: true },
      }),
      prisma.reengagementNotification.groupBy({
        by: ["messageType"],
        where: { clicked: true },
        _count: { id: true },
      }),
      prisma.reengagementCampaign.findMany({
        take: 20,
        orderBy: { campaignStartDate: "desc" },
        include: {
          user: {
            select: {
              username: true,
              profile: { select: { fullName: true } },
            },
          },
          _count: { select: { notifications: true } },
          notifications: {
            where: { clicked: true },
            select: { id: true },
          },
        },
      }),
    ]);

    const clickRate =
      totalNotifications > 0 ? (clickedNotifications / totalNotifications) * 100 : 0;
    const returnRate = totalCampaigns > 0 ? (returnedCampaigns / totalCampaigns) * 100 : 0;

    const byLevel = {
      level1: calculateLevelMetrics(levelMetricsAll, levelMetricsClicked, 1),
      level2: calculateLevelMetrics(levelMetricsAll, levelMetricsClicked, 2),
      level3: calculateLevelMetrics(levelMetricsAll, levelMetricsClicked, 3),
    };

    const byType = {
      skillMaintenance: calculateTypeMetrics(
        typeMetricsAll,
        typeMetricsClicked,
        "skill-maintenance",
      ),
      weMissYou: calculateTypeMetrics(typeMetricsAll, typeMetricsClicked, "we-miss-you"),
      dogDevelopment: calculateTypeMetrics(
        typeMetricsAll,
        typeMetricsClicked,
        "dog-development",
      ),
    };

    const recentCampaigns: RecentCampaign[] = recentCampaignsData.map((campaign) => ({
      id: campaign.id,
      userId: campaign.userId,
      userName: campaign.user.profile?.fullName || campaign.user.username,
      campaignStartDate: campaign.campaignStartDate,
      level: campaign.currentLevel,
      notificationsSent: campaign._count.notifications,
      clicked: campaign.notifications.length,
      returned: campaign.returned,
      unsubscribed: campaign.unsubscribed,
      isActive: campaign.isActive,
    }));

    logger.info("Re-engagement метрики получены", {
      totalCampaigns,
      activeCampaigns,
      totalNotifications,
      clickedNotifications,
      clickRate: clickRate.toFixed(2),
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
          returnRate: Math.round(returnRate * 100) / 100,
        },
        byLevel,
        byType,
        recentCampaigns,
      },
    };
  } catch (error) {
    logger.error("Ошибка получения метрик re-engagement", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
