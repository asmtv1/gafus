import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { StorageStats } from "./types";

const logger = createWebLogger("admin-storage-service");

export async function getStorageStats(): Promise<
  { success: true; data: StorageStats } | { success: false; error: string }
> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalExamResults,
      withVideo,
      withoutVideo,
      deletedVideos,
      completedWithVideo,
      pendingWithVideo,
      completedOlderThan30Days,
      pendingOlderThan90Days,
      deletedByReplacement,
      deletedByAutoCleanupCompleted,
      deletedByAutoCleanupPending,
    ] = await Promise.all([
      prisma.examResult.count(),
      prisma.examResult.count({
        where: { videoReportUrl: { not: null }, videoDeletedAt: null },
      }),
      prisma.examResult.count({
        where: { OR: [{ videoReportUrl: null }, { videoDeletedAt: { not: null } }] },
      }),
      prisma.examResult.count({ where: { videoDeletedAt: { not: null } } }),
      prisma.examResult.count({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null,
          userStep: { status: "COMPLETED" },
        },
      }),
      prisma.examResult.count({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null,
          userStep: { status: "IN_PROGRESS" },
        },
      }),
      prisma.examResult.count({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null,
          userStep: { status: "COMPLETED" },
          updatedAt: { lt: thirtyDaysAgo },
        },
      }),
      prisma.examResult.count({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null,
          userStep: { status: "IN_PROGRESS" },
          createdAt: { lt: ninetyDaysAgo },
        },
      }),
      prisma.examResult.count({ where: { videoDeleteReason: "replaced" } }),
      prisma.examResult.count({ where: { videoDeleteReason: "auto_cleanup_completed" } }),
      prisma.examResult.count({ where: { videoDeleteReason: "auto_cleanup_pending" } }),
    ]);

    return {
      success: true,
      data: {
        totalExamResults,
        withVideo,
        withoutVideo,
        deletedVideos,
        completedWithVideo,
        pendingWithVideo,
        completedOlderThan30Days,
        pendingOlderThan90Days,
        deletedByReplacement,
        deletedByAutoCleanupCompleted,
        deletedByAutoCleanupPending,
      },
    };
  } catch (error) {
    logger.error("Ошибка при получении статистики хранилища", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
