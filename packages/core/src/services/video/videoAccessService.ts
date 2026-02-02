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
 * 2. Он имеет активный CourseAccess к курсу, содержащему это видео
 *
 * @param params - userId и videoId
 * @returns true если доступ разрешен, false если запрещен
 */
export async function checkVideoAccess(params: CheckVideoAccessParams): Promise<boolean> {
  const { userId, videoId } = params;

  try {
    // Получаем информацию о видео
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        trainerId: true,
      },
    });

    if (!video) {
      logger.warn("Video access check failed: video not found", { userId, videoId });
      return false;
    }

    // Проверка 1: Пользователь = владелец видео
    if (video.trainerId === userId) {
      logger.info("Video access granted: user is owner", { userId, videoId });
      return true;
    }

    // Проверка 2: Пользователь имеет CourseAccess к курсу с этим видео
    const courseAccess = await prisma.courseAccess.findFirst({
      where: {
        userId,
        course: {
          dayLinks: {
            some: {
              day: {
                stepLinks: {
                  some: {
                    step: {
                      videoUrl: {
                        contains: videoId,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (courseAccess) {
      logger.info("Video access granted: user has course access", { userId, videoId });
      return true;
    }

    // Доступ запрещен
    logger.warn("Video access denied: no permissions", { userId, videoId, trainerId: video.trainerId });
    return false;
  } catch (error) {
    logger.error("Video access check error", error as Error, { userId, videoId });
    // Fail-secure: при ошибке запрещаем доступ
    return false;
  }
}
