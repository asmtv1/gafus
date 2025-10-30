"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('get-presentation-stats');

/**
 * Типы для статистики presentation.html
 */
export interface PresentationStats {
  overview: {
    totalViews: number;
    uniqueSessions: number;
    uniqueVisitors: number; // Уникальные посетители (по visitorId)
    avgTimeOnPage: number;
    avgScrollDepth: number;
    totalTimeSpent: number; // в секундах
  };
  engagement: {
    deepEngagement: number; // Прокрутка >50% и время >1 мин
    readToEnd: number; // Прокрутка 100%
    stayedLong: number; // Время >5 мин
    clickedCTA: number; // Кликнули по CTA
    avgClicksPerSession: number;
  };
  funnel: {
    hero: number;
    problem: number;
    solution: number;
    features: number;
    comparison: number;
    goals: number;
    contact: number;
  };
  byReferrer: {
    domain: string | null;
    views: number;
    uniqueSessions: number;
    avgTimeOnPage: number;
    deepEngagementRate: number;
  }[];
  byUTM: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    views: number;
  }[];
  byDevice: {
    deviceType: string | null;
    views: number;
    avgTimeOnPage: number;
  }[];
  scrollMilestones: {
    milestone: number;
    reached: number;
    percentage: number;
  }[];
  recentViews: {
    id: string;
    sessionId: string;
    referrer: string | null;
    referrerDomain: string | null;
    timeOnPage: number | null;
    scrollDepth: number | null;
    ctaClicks: number;
    deviceType: string | null;
    firstViewAt: Date;
    lastViewAt: Date;
  }[];
  timeDistribution: {
    hour: number;
    views: number;
  }[];
}

/**
 * Получить статистику по presentation.html (только для ADMIN)
 */
export async function getPresentationStats(): Promise<{
  success: boolean;
  data?: PresentationStats;
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

    // Проверить роль ADMIN или MODERATOR
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return {
        success: false,
        error: "Недостаточно прав доступа"
      };
    }

    // 1. Общая статистика
    const [
      totalViews,
      uniqueSessions,
      uniqueVisitors,
      avgTimeResult,
      avgScrollResult,
      totalTimeResult,
      deepEngagement,
      readToEnd,
      stayedLong,
      clickedCTA,
      totalClicks
    ] = await Promise.all([
      prisma.presentationView.count(),
      // Уникальные сессии (по sessionId)
      prisma.presentationView.groupBy({
        by: ['sessionId'],
        _count: { id: true }
      }).then(result => result.length),
      // Уникальные посетители (по visitorId, если есть)
      prisma.presentationView.groupBy({
        by: ['visitorId'],
        where: { visitorId: { not: null } },
        _count: { id: true }
      }).then(result => result.length),
      prisma.presentationView.aggregate({
        _avg: { timeOnPage: true },
        where: { timeOnPage: { not: null } }
      }),
      prisma.presentationView.aggregate({
        _avg: { scrollDepth: true },
        where: { scrollDepth: { not: null } }
      }),
      prisma.presentationView.aggregate({
        _sum: { timeOnPage: true },
        where: { timeOnPage: { not: null } }
      }),
      prisma.presentationView.count({
        where: {
          AND: [
            { scrollDepth: { gte: 50 } },
            { timeOnPage: { gte: 60 } }
          ]
        }
      }),
      prisma.presentationView.count({ where: { scrollDepth: { gte: 100 } } }),
      prisma.presentationView.count({ where: { timeOnPage: { gte: 300 } } }),
      prisma.presentationView.count({ where: { ctaClicks: { gt: 0 } } }),
      prisma.presentationView.aggregate({
        _sum: { ctaClicks: true }
      }).then(r => r._sum.ctaClicks || 0)
    ]);

    const avgTimeOnPage = avgTimeResult._avg.timeOnPage || 0;
    const avgScrollDepth = avgScrollResult._avg.scrollDepth || 0;
    const totalTimeSpent = totalTimeResult._sum.timeOnPage || 0;
    const avgClicksPerSession = uniqueSessions > 0 ? totalClicks / uniqueSessions : 0;

    // 2. Статистика по источникам (referrer)
    const referrerStats = await prisma.presentationView.groupBy({
      by: ['referrerDomain'],
      _count: { id: true },
      _avg: { timeOnPage: true },
      where: {
        referrerDomain: { not: null }
      }
    });

    const uniqueSessionsByReferrer = await prisma.presentationView.groupBy({
      by: ['referrerDomain', 'sessionId'],
      where: {
        referrerDomain: { not: null }
      }
    });

    // Подсчитываем уникальные сессии по доменам
    const sessionsByDomain = new Map<string | null, Set<string>>();
    uniqueSessionsByReferrer.forEach(item => {
      const domain = item.referrerDomain;
      if (!sessionsByDomain.has(domain)) {
        sessionsByDomain.set(domain, new Set());
      }
      sessionsByDomain.get(domain)!.add(item.sessionId);
    });

    // Получаем вовлечённость по источникам
    const referrerEngagement = await prisma.presentationView.groupBy({
      by: ['referrerDomain'],
      _count: { id: true },
      where: {
        AND: [
          { scrollDepth: { gte: 50 } },
          { timeOnPage: { gte: 60 } }
        ]
      }
    });

    const engagementByDomain = new Map(referrerEngagement.map(r => [r.referrerDomain, r._count.id]));

    const byReferrer = referrerStats.map(stat => {
      const domain = stat.referrerDomain;
      const views = stat._count.id;
      const engagement = engagementByDomain.get(domain) || 0;
      
      return {
        domain,
        views,
        uniqueSessions: sessionsByDomain.get(domain)?.size || 0,
        avgTimeOnPage: Math.round((stat._avg.timeOnPage || 0) * 10) / 10,
        deepEngagementRate: views > 0 ? Math.round((engagement / views) * 100 * 10) / 10 : 0
      };
    }).sort((a, b) => b.views - a.views).slice(0, 10); // Топ 10

    // 3. Статистика по UTM меткам
    const utmStats = await prisma.presentationView.groupBy({
      by: ['utmSource', 'utmMedium', 'utmCampaign'],
      _count: { id: true },
      where: {
        OR: [
          { utmSource: { not: null } },
          { utmMedium: { not: null } },
          { utmCampaign: { not: null } }
        ]
      }
    });

    const byUTM = utmStats.map(stat => ({
      source: stat.utmSource,
      medium: stat.utmMedium,
      campaign: stat.utmCampaign,
      views: stat._count.id
    })).sort((a, b) => b.views - a.views).slice(0, 10); // Топ 10

    // Статистика по устройствам
    const deviceStats = await prisma.presentationView.groupBy({
      by: ['deviceType'],
      _count: { id: true },
      _avg: { timeOnPage: true }
    });

    const byDevice = deviceStats.map(stat => ({
      deviceType: stat.deviceType,
      views: stat._count.id,
      avgTimeOnPage: Math.round((stat._avg.timeOnPage || 0) * 10) / 10
    }));

    // Воронка конверсии по секциям
    const funnel = {
      hero: totalViews, // Всегда 100%
      problem: await prisma.presentationView.count({ where: { reachedProblem: { not: null } } }),
      solution: await prisma.presentationView.count({ where: { reachedSolution: { not: null } } }),
      features: await prisma.presentationView.count({ where: { reachedFeatures: { not: null } } }),
      comparison: await prisma.presentationView.count({ where: { reachedComparison: { not: null } } }),
      goals: await prisma.presentationView.count({ where: { reachedGoals: { not: null } } }),
      contact: await prisma.presentationView.count({ where: { reachedContact: { not: null } } }),
    };

    // Вехи прокрутки
    const scrollMilestones = await Promise.all([
      prisma.presentationEvent.count({ where: { eventName: 'scroll_25' } }),
      prisma.presentationEvent.count({ where: { eventName: 'scroll_50' } }),
      prisma.presentationEvent.count({ where: { eventName: 'scroll_75' } }),
      prisma.presentationEvent.count({ where: { eventName: 'scroll_100' } }),
    ]);

    const scrollMilestonesData = [
      { milestone: 25, reached: scrollMilestones[0], percentage: totalViews > 0 ? Math.round((scrollMilestones[0] / totalViews) * 100 * 10) / 10 : 0 },
      { milestone: 50, reached: scrollMilestones[1], percentage: totalViews > 0 ? Math.round((scrollMilestones[1] / totalViews) * 100 * 10) / 10 : 0 },
      { milestone: 75, reached: scrollMilestones[2], percentage: totalViews > 0 ? Math.round((scrollMilestones[2] / totalViews) * 100 * 10) / 10 : 0 },
      { milestone: 100, reached: scrollMilestones[3], percentage: totalViews > 0 ? Math.round((scrollMilestones[3] / totalViews) * 100 * 10) / 10 : 0 },
    ];

    // 4. Последние просмотры
    const recentViews = await prisma.presentationView.findMany({
      take: 50,
      orderBy: { firstViewAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        referrer: true,
        referrerDomain: true,
        timeOnPage: true,
        scrollDepth: true,
        ctaClicks: true,
        deviceType: true,
        firstViewAt: true,
        lastViewAt: true
      }
    });

    // 5. Распределение по времени суток
    const timeDistribution = await prisma.presentationView.findMany({
      select: {
        firstViewAt: true
      }
    });

    const hoursMap = new Map<number, number>();
    timeDistribution.forEach(view => {
      const hour = new Date(view.firstViewAt).getHours();
      hoursMap.set(hour, (hoursMap.get(hour) || 0) + 1);
    });

    const timeDistributionArray = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      views: hoursMap.get(i) || 0
    }));

    logger.info('Статистика presentation.html получена', {
      totalViews,
      uniqueSessions,
      avgTimeOnPage: Math.round(avgTimeOnPage * 10) / 10
    });

    return {
      success: true,
      data: {
        overview: {
          totalViews,
          uniqueSessions,
          uniqueVisitors,
          avgTimeOnPage: Math.round(avgTimeOnPage * 10) / 10,
          avgScrollDepth: Math.round(avgScrollDepth * 10) / 10,
          totalTimeSpent: Math.round(totalTimeSpent)
        },
        engagement: {
          deepEngagement,
          readToEnd,
          stayedLong,
          clickedCTA,
          avgClicksPerSession: Math.round(avgClicksPerSession * 10) / 10
        },
        funnel,
        byReferrer,
        byUTM,
        byDevice,
        scrollMilestones: scrollMilestonesData,
        recentViews: recentViews.map(view => ({
          id: view.id,
          sessionId: view.sessionId,
          referrer: view.referrer,
          referrerDomain: view.referrerDomain,
          timeOnPage: view.timeOnPage,
          scrollDepth: view.scrollDepth,
          ctaClicks: view.ctaClicks,
          deviceType: view.deviceType,
          firstViewAt: view.firstViewAt,
          lastViewAt: view.lastViewAt
        })),
        timeDistribution: timeDistributionArray
      }
    };
  } catch (error) {
    logger.error('Ошибка получения статистики presentation.html', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

