/**
 * Video Progress Service - бизнес-логика сохранения и восстановления позиции просмотра видео
 *
 * Чистая бизнес-логика без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { validateVideoPosition } from "@gafus/core/services/video-position-policy";

const logger = createWebLogger("video-progress-service");

// Максимальная позиция в секундах (24 часа) - защита от мусора


/**
 * Получает последнюю сохраненную позицию просмотра видео для пользователя
 *
 * @param userId - ID пользователя
 * @param videoId - ID видео (TrainerVideo)
 * @returns Объект с lastPositionSec или null если прогресса нет
 */
export async function getProgress(
  userId: string,
  videoId: string,
): Promise<{ lastPositionSec: number } | null> {
  logger.info("Getting video progress");

  const progress = await prisma.userVideoProgress.findUnique({
    where: {
      userId_videoId: { userId, videoId },
    },
    select: {
      lastPositionSec: true,
    },
  });

  if (!progress) {
    logger.info("No video progress found");
    return null;
  }

  logger.info("Video progress found");
  return { lastPositionSec: progress.lastPositionSec };
}

/**
 * Сохраняет позицию просмотра видео (upsert по userId + videoId)
 *
 * @param userId - ID пользователя
 * @param videoId - ID видео (TrainerVideo)
 * @param lastPositionSec - Позиция в секундах
 * @returns Результат операции с success/error
 */
export async function saveProgress(
  userId: string,
  videoId: string,
  lastPositionSec: number,
): Promise<{ success: boolean; error?: string }> {
  const error = validateVideoPosition(lastPositionSec);
  if (error) return { success: false, error };

  // Опционально: проверка существования видео
  const video = await prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { id: true },
  });

  if (!video) {
    logger.warn("Attempt to save progress for non-existent video");
    return { success: false, error: "Видео не найдено" };
  }

  // Upsert прогресса
  await prisma.userVideoProgress.upsert({
    where: {
      userId_videoId: { userId, videoId },
    },
    create: {
      userId,
      videoId,
      lastPositionSec,
    },
    update: {
      lastPositionSec,
      updatedAt: new Date(),
    },
  });

  logger.info("Video progress saved");
  return { success: true };
}
