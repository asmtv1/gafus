/**
 * Trainer Video Service — бизнес-логика видео тренеров.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { getVideoAccessService } from "@gafus/video-access";
import type { ActionResult } from "@gafus/types";
import type { TrainerVideoDto } from "@gafus/types";
import type { TranscodingStatus } from "@gafus/prisma";
import { handlePrismaError, ServiceError } from "@gafus/core/errors";
import type { RegisterTrainerVideoInput } from "./schemas";

const logger = createWebLogger("trainer-video");

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** Базовый URL CDN для формирования fullCdnUrl при очистке ссылок в Step/StepTemplate */
const CDN_BASE_URL = "https://gafus-media.storage.yandexcloud.net/";

/** Данные для удаления видео: app сначала удаляет из CDN, затем вызывает deleteTrainerVideoRecord */
export interface GetDeletePayloadResult {
  relativePath: string | null;
  hlsManifestPath: string | null;
  videoId: string;
  fullCdnUrl: string | null;
}

export interface VideoStatusResult {
  id: string;
  transcodingStatus: TranscodingStatus;
  transcodingError: string | null;
  hlsManifestPath: string | null;
  thumbnailPath: string | null;
  durationSec: number | null;
}

/**
 * Регистрирует видео тренера после загрузки на CDN.
 */
export async function registerTrainerVideo(
  input: RegisterTrainerVideoInput,
): Promise<ActionResult & { data?: TrainerVideoDto }> {
  try {
    const { id, durationSec = null, ...rest } = input;

    const video = await prisma.trainerVideo.create({
      data: {
        ...(id ? { id } : {}),
        ...rest,
        durationSec,
      },
      include: {
        trainer: {
          select: {
            username: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    const dto: TrainerVideoDto = {
      id: video.id,
      trainerId: video.trainerId,
      relativePath: video.relativePath,
      originalName: video.originalName,
      displayName: video.displayName,
      mimeType: video.mimeType,
      fileSize: video.fileSize,
      durationSec: video.durationSec,
      hlsManifestPath: video.hlsManifestPath,
      thumbnailPath: video.thumbnailPath,
      transcodingStatus: video.transcodingStatus,
      transcodingError: video.transcodingError,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      trainer: video.trainer
        ? {
            username: video.trainer.username,
            fullName: video.trainer.profile?.fullName ?? null,
          }
        : undefined,
    };

    logger.success("Видео зарегистрировано", { videoId: video.id, trainerId: video.trainerId });
    return { success: true, data: dto };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео тренера");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError
          ? serviceError.message
          : "Не удалось зарегистрировать видео";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка регистрации видео", error, { input: input.trainerId });
    return { success: false, error: error.message };
  }
}

/**
 * Возвращает данные для удаления видео из CDN. App вызывает CDN delete, затем deleteTrainerVideoRecord.
 */
export async function getDeletePayload(
  videoId: string,
  requesterId: string,
  requesterRole: string,
): Promise<ActionResult & { data?: GetDeletePayloadResult }> {
  try {
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        trainerId: true,
        relativePath: true,
        hlsManifestPath: true,
        originalName: true,
      },
    });

    if (!video) {
      return { success: false, error: "Видео не найдено" };
    }

    const isAdmin = requesterRole === "ADMIN";
    const isModerator = requesterRole === "MODERATOR";

    if (!isAdmin && !isModerator && video.trainerId !== requesterId) {
      logger.warn("Попытка удаления чужого видео", {
        videoId,
        requesterId,
        ownerId: video.trainerId,
      });
      return { success: false, error: "Недостаточно прав для удаления этого видео" };
    }

    const fullCdnUrl =
      video.relativePath && video.relativePath.trim().length > 0
        ? `${CDN_BASE_URL}${video.relativePath}`
        : null;

    return {
      success: true,
      data: {
        relativePath: video.relativePath,
        hlsManifestPath: video.hlsManifestPath,
        videoId: video.id,
        fullCdnUrl,
      },
    };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError
          ? serviceError.message
          : "Не удалось получить данные видео";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка получения данных для удаления видео", error, { videoId });
    return { success: false, error: error.message };
  }
}

/**
 * Очищает ссылки на видео в Step/StepTemplate и удаляет запись TrainerVideo.
 * Вызывать после успешного удаления файлов из CDN в app.
 */
export async function deleteTrainerVideoRecord(
  videoId: string,
  fullCdnUrl: string | null,
): Promise<ActionResult> {
  try {
    if (fullCdnUrl) {
      await prisma.step.updateMany({
        where: {
          OR: [{ videoUrl: { contains: videoId } }, { videoUrl: fullCdnUrl }],
        },
        data: { videoUrl: null },
      });
      await prisma.stepTemplate.updateMany({
        where: {
          OR: [{ videoUrl: { contains: videoId } }, { videoUrl: fullCdnUrl }],
        },
        data: { videoUrl: null },
      });
    }

    await prisma.trainerVideo.delete({
      where: { id: videoId },
    });

    logger.success("Запись видео удалена из БД", { videoId });
    return { success: true };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError
          ? serviceError.message
          : "Не удалось удалить видео";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка удаления записи видео", error, { videoId });
    return { success: false, error: error.message };
  }
}

/**
 * Обновляет отображаемое название видео.
 */
export async function updateTrainerVideoName(
  videoId: string,
  trainerId: string,
  displayName: string | null,
): Promise<ActionResult> {
  try {
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: { id: true, trainerId: true },
    });

    if (!video) {
      return { success: false, error: "Видео не найдено" };
    }

    if (video.trainerId !== trainerId) {
      logger.warn("Попытка редактирования чужого видео", {
        videoId,
        trainerId,
        ownerId: video.trainerId,
      });
      return { success: false, error: "Недостаточно прав для редактирования этого видео" };
    }

    await prisma.trainerVideo.update({
      where: { id: videoId },
      data: { displayName },
    });

    logger.success("Название видео обновлено", { videoId });
    return { success: true };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError
          ? serviceError.message
          : "Не удалось обновить название";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка обновления названия видео", error, { videoId });
    return { success: false, error: error.message };
  }
}

/**
 * Возвращает список видео тренера (для тренера — только свои, для ADMIN — все).
 */
export async function getTrainerVideos(
  trainerId: string,
  options: { forAdmin?: boolean } = {},
): Promise<TrainerVideoDto[]> {
  const where = options.forAdmin ? undefined : { trainerId };

  const videos = await prisma.trainerVideo.findMany({
    where,
    include: {
      trainer: {
        select: {
          username: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return videos.map((video) => ({
    id: video.id,
    trainerId: video.trainerId,
    relativePath: video.relativePath,
    originalName: video.originalName,
    displayName: video.displayName,
    mimeType: video.mimeType,
    fileSize: video.fileSize,
    durationSec: video.durationSec,
    hlsManifestPath: video.hlsManifestPath,
    thumbnailPath: video.thumbnailPath,
    transcodingStatus: video.transcodingStatus,
    transcodingError: video.transcodingError,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    trainer: video.trainer
      ? {
          username: video.trainer.username,
          fullName: video.trainer.profile?.fullName ?? null,
        }
      : undefined,
  }));
}

/**
 * Генерирует токен для подписанного URL манифеста (HLS).
 * App строит полный URL: `${baseUrl}/api/video/${videoId}/manifest?token=${token}`.
 */
export function getSignedVideoToken(
  videoId: string,
  userId: string,
  ttlMinutes: number = 120,
): string {
  const videoAccessService = getVideoAccessService();
  return videoAccessService.generateToken({
    videoId,
    userId,
    ttlMinutes,
  });
}

/**
 * Возвращает статусы транскодирования для нескольких видео.
 */
export async function getMultipleVideoStatuses(
  videoIds: string[],
): Promise<ActionResult & { data?: VideoStatusResult[] }> {
  if (videoIds.length === 0) {
    return { success: true, data: [] };
  }

  try {
    const videos = await prisma.trainerVideo.findMany({
      where: { id: { in: videoIds } },
      select: {
        id: true,
        transcodingStatus: true,
        transcodingError: true,
        hlsManifestPath: true,
        thumbnailPath: true,
        durationSec: true,
      },
    });

    return {
      success: true,
      data: videos.map((v) => ({
        id: v.id,
        transcodingStatus: v.transcodingStatus,
        transcodingError: v.transcodingError,
        hlsManifestPath: v.hlsManifestPath,
        thumbnailPath: v.thumbnailPath,
        durationSec: v.durationSec,
      })),
    };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError
          ? serviceError.message
          : "Не удалось получить статусы";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка получения статусов видео", error, { videoIds });
    return { success: false, error: error.message };
  }
}
