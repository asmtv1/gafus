/**
 * Сервис проверки прав доступа к видео (IDOR protection)
 */

import { prisma } from "@gafus/prisma";
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
 *    - публичный бесплатный курс (isPrivate=false, isPaid=false) — доступ всем;
 *    - платный/приватный — нужна запись CourseAccess (или оплата).
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

    // Шаги хранят videoUrl с CUID в пути — проверяем вхождение videoId
    const coursesWithVideo = await prisma.course.findMany({
      where: {
        dayLinks: {
          some: {
            day: {
              stepLinks: {
                some: {
                  step: {
                    videoUrl: { contains: videoId },
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        isPrivate: true,
        isPaid: true,
        access: { where: { userId }, select: { userId: true } },
      },
    });

    for (const course of coursesWithVideo) {
      const isPublicFree = !course.isPrivate && !course.isPaid;
      const hasExplicitAccess = course.access.length > 0;
      if (isPublicFree || hasExplicitAccess) {
        logger.info("Video access granted: course access", {
          userId,
          videoId,
          courseId: course.id,
          isPublicFree,
        });
        return true;
      }
    }

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
