"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

export interface StorageStats {
  totalExamResults: number;
  withVideo: number;
  withoutVideo: number;
  deletedVideos: number;
  
  // По статусам
  completedWithVideo: number;
  pendingWithVideo: number;
  
  // Старые экзамены (кандидаты на удаление)
  completedOlderThan30Days: number;
  pendingOlderThan90Days: number;
  
  // Причины удаления
  deletedByReplacement: number;
  deletedByAutoCleanupCompleted: number;
  deletedByAutoCleanupPending: number;
}

/**
 * Получает статистику хранилища видео экзаменов
 * Только для администраторов
 */
export async function getStorageStats(): Promise<StorageStats> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error("Не авторизован");
  }

  if (session.user.role !== "ADMIN") {
    throw new Error("Доступ запрещен. Только для администраторов");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  try {
    // Общие статистики
    const totalExamResults = await prisma.examResult.count();
    const withVideo = await prisma.examResult.count({
      where: { videoReportUrl: { not: null }, videoDeletedAt: null }
    });
    const withoutVideo = await prisma.examResult.count({
      where: { OR: [{ videoReportUrl: null }, { videoDeletedAt: { not: null } }] }
    });
    const deletedVideos = await prisma.examResult.count({
      where: { videoDeletedAt: { not: null } }
    });

    // По статусам
    const completedWithVideo = await prisma.examResult.count({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "COMPLETED" }
      }
    });

    const pendingWithVideo = await prisma.examResult.count({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "IN_PROGRESS" }
      }
    });

    // Кандидаты на удаление
    const completedOlderThan30Days = await prisma.examResult.count({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "COMPLETED" },
        updatedAt: { lt: thirtyDaysAgo }
      }
    });

    const pendingOlderThan90Days = await prisma.examResult.count({
      where: {
        videoReportUrl: { not: null },
        videoDeletedAt: null,
        userStep: { status: "IN_PROGRESS" },
        createdAt: { lt: ninetyDaysAgo }
      }
    });

    // Причины удаления
    const deletedByReplacement = await prisma.examResult.count({
      where: { videoDeleteReason: "replaced" }
    });

    const deletedByAutoCleanupCompleted = await prisma.examResult.count({
      where: { videoDeleteReason: "auto_cleanup_completed" }
    });

    const deletedByAutoCleanupPending = await prisma.examResult.count({
      where: { videoDeleteReason: "auto_cleanup_pending" }
    });

    return {
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
      deletedByAutoCleanupPending
    };
  } catch (error) {
    console.error("Ошибка при получении статистики хранилища:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}

