/**
 * Сервис проверки прав доступа к видео (IDOR protection)
 */

import { prisma } from "@gafus/prisma";
import { resolveCourseStepTargetTx, resolveCourseStepAccessTx } from "../contentAccess";

export interface VideoManifestInfo {
  hlsManifestPath: string | null;
  thumbnailPath: string | null;
  transcodingStatus: string;
  trainerId: string;
}

/**
 * Получает информацию о видео для manifest/segment (путь к HLS, статус, trainerId).
 */
export async function getVideoManifestInfo(videoId: string): Promise<VideoManifestInfo | null> {
  const video = await prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: {
      hlsManifestPath: true,
      thumbnailPath: true,
      transcodingStatus: true,
      trainerId: true,
    },
  });
  return video;
}
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("video-access-service");

export interface CheckVideoAccessParams {
  userId: string;
  videoId: string;
}

/**
 * Проверяет, имеет ли пользователь право просматривать указанное видео
 *
 * Пользователь имеет доступ если:
 * 1. Он является владельцем видео (trainerId === userId)
 * 2. Видео входит в курс, к которому у пользователя есть доступ:
 *    - публичный курс — требуется доступ к содержимому шага;
 *    - приватный курс — требуется назначенный доступ.
 *
 * @param params - userId и videoId
 * @returns true если доступ разрешен, false если запрещен
 */
export async function checkVideoAccess(params: CheckVideoAccessParams): Promise<boolean> {
  const { userId, videoId } = params;

  try {
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: { id: true, trainerId: true },
    });

    if (!video) {
      logger.warn("Video access check failed: video not found", { userId, videoId });
      return false;
    }

    if (video.trainerId === userId) {
      logger.info("Video access granted: user is owner", { userId, videoId });
      return true;
    }

    // An occurrence is unique to a course/day even when a TrainingDay is reused.
    const stepLinks = await prisma.stepOnDay.findMany({
      where: { step: { videoUrl: { contains: videoId } } },
      select: { id: true, dayId: true },
    });
    const dayIds = [...new Set(stepLinks.map(link => link.dayId))];
    if (dayIds.length) {
      const occurrences = await prisma.dayOnCourse.findMany({
        where: { dayId: { in: dayIds } },
        select: { id: true, dayId: true },
      });
      const now = new Date();
      for (const occurrence of occurrences) {
        for (const link of stepLinks) {
          if (link.dayId !== occurrence.dayId) continue;
          const target = await resolveCourseStepTargetTx(prisma, occurrence.id, link.id);
          if (!target) continue;
          const entitlement = await resolveCourseStepAccessTx(prisma, userId, target, now);
          if (entitlement.allowed) return true;
          // Rewarded ads grant one occurrence's step, never a private course.
          if (!target.isPrivate) {
            const rewarded = await prisma.rewardedTargetAccess.findFirst({
              where: {
                userId, targetType: "COURSE_STEP", targetId: link.id,
                expiresAt: { gt: now },
              },
              select: { id: true },
            });
            if (rewarded) return true;
          }
        }
      }
    }
    const daily = await prisma.dailyCourseBundleStep.findFirst({
      where: {
        step: { videoUrl: { contains: videoId } },
        bundle: { schedules: { some: { isPublished: true, date: { lte: new Date() } } } },
      },
      select: { id: true },
    });
    if (daily) return true;

    logger.warn("Video access denied: no permissions", {
      userId,
      videoId,
      trainerId: video.trainerId,
    });
    return false;
  } catch (error) {
    logger.error("Video access check error", error as Error, { userId, videoId });
    return false;
  }
}
