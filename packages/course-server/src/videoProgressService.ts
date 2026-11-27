/**
 * Video Progress Service - бизнес-логика сохранения и восстановления позиции просмотра видео
 *
 * Чистая бизнес-логика без Next.js специфики.
 */

import { prisma, type Prisma } from "@gafus/prisma";
import { createHash } from "node:crypto";
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

type VideoPositionRow = { id: string; lastPositionSec: number; updatedAt: Date };
function videoProgressVersion(row: VideoPositionRow | null): string {
  return row ? createHash("sha256").update(JSON.stringify([row.id,row.lastPositionSec,row.updatedAt.toISOString()])).digest("hex") : "none";
}
const snapshotSelect = { id: true, lastPositionSec: true, updatedAt: true } as const;

export async function getProgressSnapshot(userId: string, videoId: string) {
  const row = await prisma.userVideoProgress.findUnique({
    where: { userId_videoId: { userId, videoId } }, select: snapshotSelect,
  });
  return { lastPositionSec: row?.lastPositionSec ?? 0, progressVersion: videoProgressVersion(row) };
}

/** Atomic compare-and-set of the SAME bookmark used by online players.
 * Concurrent normal upsert wins or is observed as a conflict, never overwritten
 * by an older offline snapshot. Caller owns the enclosing journal transaction. */
export async function saveProgressJournalTx(
  tx: Prisma.TransactionClient, userId: string, videoId: string, positionSec: number, expectedVersion: string,
): Promise<{ videoId: string; lastPositionSec: number; progressVersion: string }> {
  if (validateVideoPosition(positionSec)) throw new Error("INVALID_STATE: invalid video position");
  const video = await tx.trainerVideo.findUnique({where:{id:videoId},select:{id:true}});
  if (!video) throw new Error("VIDEO_NOT_FOUND");
  const where = { userId_videoId: {userId,videoId} };
  const prior = await tx.userVideoProgress.findUnique({where,select:snapshotSelect});
  if (videoProgressVersion(prior) !== expectedVersion) throw new Error("STALE_PROGRESS_VERSION");
  const changed = prior
    ? await tx.userVideoProgress.updateMany({
        where: { id: prior.id, userId, videoId, updatedAt: prior.updatedAt, lastPositionSec: prior.lastPositionSec },
        data: { lastPositionSec: positionSec, updatedAt: new Date() },
      })
    : await tx.userVideoProgress.createMany({data:[{userId,videoId,lastPositionSec:positionSec}],skipDuplicates:true});
  if (changed.count !== 1) throw new Error("STALE_PROGRESS_VERSION");
  const row = await tx.userVideoProgress.findUnique({where,select:snapshotSelect});
  if (!row) throw new Error("STALE_PROGRESS_VERSION");
  return { videoId, lastPositionSec: row.lastPositionSec, progressVersion: videoProgressVersion(row) };
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
  includeVersion = false,
): Promise<{ success: boolean; error?: string; progressVersion?: string }> {
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
  const saved = await prisma.userVideoProgress.upsert({
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
  return { success: true, ...(includeVersion ? { progressVersion: videoProgressVersion(saved) } : {}) };
}
