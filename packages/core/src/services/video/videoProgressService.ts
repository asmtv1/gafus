/**
 * Video Progress Service - бизнес-логика сохранения и восстановления позиции просмотра видео
 *
 * Чистая бизнес-логика без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("video-progress-service");

// Максимальная позиция в секундах (24 часа) - защита от мусора
const MAX_POSITION_SEC = 86400 * 24;

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
  logger.info("Getting video progress", { userId, videoId });

  const progress = await prisma.userVideoProgress.findUnique({
    where: {
      userId_videoId: { userId, videoId },
    },
    select: {
      lastPositionSec: true,
    },
  });

  if (!progress) {
    logger.info("No video progress found", { userId, videoId });
    return null;
  }

  logger.info("Video progress found", { userId, videoId, lastPositionSec: progress.lastPositionSec });
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
  // Валидация позиции
  if (lastPositionSec < 0) {
    return { success: false, error: "Позиция не может быть отрицательной" };
  }

  if (lastPositionSec > MAX_POSITION_SEC) {
    return {
      success: false,
      error: `Позиция не должна превышать ${MAX_POSITION_SEC} секунд`,
    };
  }

  // Опционально: проверка существования видео
  const video = await prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: { id: true },
  });

  if (!video) {
    logger.warn("Attempt to save progress for non-existent video", { userId, videoId });
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

  logger.info("Video progress saved", { userId, videoId, lastPositionSec });
  return { success: true };
}
