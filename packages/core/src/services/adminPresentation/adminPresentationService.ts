import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { PresentationStats } from "./types";

const logger = createWebLogger("admin-presentation-service");

export async function getPresentationStats(): Promise<
  { success: true; data: PresentationStats } | { success: false; error: string }
> {
  try {
    const [
      totalViews,
      uniqueSessionsResult,
      uniqueVisitorsResult,
      avgTimeResult,
      avgScrollResult,
      totalTimeResult,
      deepEngagement,
      readToEnd,
      stayedLong,
      clickedCTA,
      totalClicksResult,
    ] = await Promise.all([
      prisma.presentationView.count(),
      prisma.presentationView.groupBy({
        by: ["sessionId"],
        _count: { id: true },
      }),
      prisma.presentationView.groupBy({
        by: ["visitorId"],
        where: { visitorId: { not: null } },
        _count: { id: true },
      }),
      prisma.presentationView.aggregate({
        _avg: { timeOnPage: true },
        where: { timeOnPage: { not: null } },
      }),
      prisma.presentationView.aggregate({
        _avg: { scrollDepth: true },
        where: { scrollDepth: { not: null } },
      }),
      prisma.presentationView.aggregate({
        _sum: { timeOnPage: true },
        where: { timeOnPage: { not: null } },
      }),
      prisma.presentationView.count({
        where: {
          AND: [{ scrollDepth: { gte: 50 } }, { timeOnPage: { gte: 60 } }],
        },
      }),
      prisma.presentationView.count({ where: { scrollDepth: { gte: 100 } } }),
      prisma.presentationView.count({ where: { timeOnPage: { gte: 300 } } }),
      prisma.presentationView.count({ where: { ctaClicks: { gt: 0 } } }),
      prisma.presentationView.aggregate({ _sum: { ctaClicks: true } }),
    ]);

    const uniqueSessions = uniqueSessionsResult.length;
    const uniqueVisitors = uniqueVisitorsResult.length;
    const avgTimeOnPage = avgTimeResult._avg.timeOnPage || 0;
    const avgScrollDepth = avgScrollResult._avg.scrollDepth || 0;
    const totalTimeSpent = totalTimeResult._sum.timeOnPage || 0;
    const totalClicks = totalClicksResult._sum.ctaClicks || 0;
    const avgClicksPerSession = uniqueSessions > 0 ? totalClicks / uniqueSessions : 0;

    const [referrerStats, uniqueSessionsByReferrer, referrerEngagement, utmStats, deviceStats] =
      await Promise.all([
        prisma.presentationView.groupBy({
          by: ["referrerDomain"],
          _count: { id: true },
          _avg: { timeOnPage: true },
          where: { referrerDomain: { not: null } },
        }),
        prisma.presentationView.groupBy({
          by: ["referrerDomain", "sessionId"],
          where: { referrerDomain: { not: null } },
        }),
        prisma.presentationView.groupBy({
          by: ["referrerDomain"],
          _count: { id: true },
          where: {
            AND: [{ scrollDepth: { gte: 50 } }, { timeOnPage: { gte: 60 } }],
          },
        }),
        prisma.presentationView.groupBy({
          by: ["utmSource", "utmMedium", "utmCampaign"],
          _count: { id: true },
          where: {
            OR: [
              { utmSource: { not: null } },
              { utmMedium: { not: null } },
              { utmCampaign: { not: null } },
            ],
          },
        }),
        prisma.presentationView.groupBy({
          by: ["deviceType"],
          _count: { id: true },
          _avg: { timeOnPage: true },
        }),
      ]);

    const sessionsByDomain = new Map<string | null, Set<string>>();
    uniqueSessionsByReferrer.forEach((item) => {
      const domain = item.referrerDomain;
      if (!sessionsByDomain.has(domain)) {
        sessionsByDomain.set(domain, new Set());
      }
      sessionsByDomain.get(domain)!.add(item.sessionId);
    });

    const engagementByDomain = new Map(
      referrerEngagement.map((r) => [r.referrerDomain, r._count.id]),
    );

    const byReferrer = referrerStats
      .map((stat) => {
        const domain = stat.referrerDomain;
        const views = stat._count.id;
        const engagement = engagementByDomain.get(domain) || 0;
        return {
          domain,
          views,
          uniqueSessions: sessionsByDomain.get(domain)?.size || 0,
          avgTimeOnPage: Math.round((stat._avg.timeOnPage || 0) * 10) / 10,
          deepEngagementRate: views > 0 ? Math.round((engagement / views) * 100 * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    const byUTM = utmStats
      .map((stat) => ({
        source: stat.utmSource,
        medium: stat.utmMedium,
        campaign: stat.utmCampaign,
        views: stat._count.id,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    const byDevice = deviceStats.map((stat) => ({
      deviceType: stat.deviceType,
      views: stat._count.id,
      avgTimeOnPage: Math.round((stat._avg.timeOnPage || 0) * 10) / 10,
    }));

    const [
      funnelProblem,
      funnelSolution,
      funnelFeatures,
      funnelComparison,
      funnelGoals,
      funnelContact,
      scroll25,
      scroll50,
      scroll75,
      scroll100,
      recentViews,
      timeDistributionData,
    ] = await Promise.all([
        prisma.presentationView.count({ where: { reachedProblem: { not: null } } }),
        prisma.presentationView.count({ where: { reachedSolution: { not: null } } }),
        prisma.presentationView.count({ where: { reachedFeatures: { not: null } } }),
        prisma.presentationView.count({ where: { reachedComparison: { not: null } } }),
        prisma.presentationView.count({ where: { reachedGoals: { not: null } } }),
        prisma.presentationView.count({ where: { reachedContact: { not: null } } }),
        prisma.presentationEvent.count({ where: { eventName: "scroll_25" } }),
        prisma.presentationEvent.count({ where: { eventName: "scroll_50" } }),
        prisma.presentationEvent.count({ where: { eventName: "scroll_75" } }),
        prisma.presentationEvent.count({ where: { eventName: "scroll_100" } }),
        prisma.presentationView.findMany({
          take: 50,
          orderBy: { firstViewAt: "desc" },
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
            lastViewAt: true,
          },
        }),
        prisma.presentationView.findMany({
          select: { firstViewAt: true },
        }),
      ]);

    const funnel = {
      hero: totalViews,
      problem: funnelProblem,
      solution: funnelSolution,
      features: funnelFeatures,
      comparison: funnelComparison,
      goals: funnelGoals,
      contact: funnelContact,
    };

    const scrollMilestones = [
      {
        milestone: 25,
        reached: scroll25,
        percentage: totalViews > 0 ? Math.round((scroll25 / totalViews) * 100 * 10) / 10 : 0,
      },
      {
        milestone: 50,
        reached: scroll50,
        percentage: totalViews > 0 ? Math.round((scroll50 / totalViews) * 100 * 10) / 10 : 0,
      },
      {
        milestone: 75,
        reached: scroll75,
        percentage: totalViews > 0 ? Math.round((scroll75 / totalViews) * 100 * 10) / 10 : 0,
      },
      {
        milestone: 100,
        reached: scroll100,
        percentage: totalViews > 0 ? Math.round((scroll100 / totalViews) * 100 * 10) / 10 : 0,
      },
    ];

    const hoursMap = new Map<number, number>();
    timeDistributionData.forEach((view) => {
      const hour = new Date(view.firstViewAt).getHours();
      hoursMap.set(hour, (hoursMap.get(hour) || 0) + 1);
    });
    const timeDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      views: hoursMap.get(i) || 0,
    }));

    logger.info("Статистика presentation.html получена", {
      totalViews,
      uniqueSessions,
      avgTimeOnPage: Math.round(avgTimeOnPage * 10) / 10,
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
          totalTimeSpent: Math.round(totalTimeSpent),
        },
        engagement: {
          deepEngagement,
          readToEnd,
          stayedLong,
          clickedCTA,
          avgClicksPerSession: Math.round(avgClicksPerSession * 10) / 10,
        },
        funnel,
        byReferrer,
        byUTM,
        byDevice,
        scrollMilestones,
        recentViews: recentViews.map((view) => ({
          id: view.id,
          sessionId: view.sessionId,
          referrer: view.referrer,
          referrerDomain: view.referrerDomain,
          timeOnPage: view.timeOnPage,
          scrollDepth: view.scrollDepth,
          ctaClicks: view.ctaClicks,
          deviceType: view.deviceType,
          firstViewAt: view.firstViewAt,
          lastViewAt: view.lastViewAt,
        })),
        timeDistribution,
      },
    };
  } catch (error) {
    logger.error("Ошибка получения статистики presentation.html", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
