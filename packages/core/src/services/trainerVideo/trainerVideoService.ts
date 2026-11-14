/**
 * Trainer Video Service — бизнес-логика видео тренеров.
 * Чистая логика без Next.js и CDN; app отвечает за сессию, CDN и revalidate.
 */

import type {
  TrainerVideoPersistencePort,
  TrainerVideoStatus as TranscodingStatus,
} from "./persistencePort";
export type { TrainerVideoPersistencePort } from "./persistencePort";
import { extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { createWebLogger } from "@gafus/logger";
import { getVideoAccessService, VIDEO_PLAYBACK_TOKEN_TTL_MINUTES } from "@gafus/video-access";
import type { ActionResult } from "@gafus/types";
import type { TrainerVideoDto } from "@gafus/types";

import { handlePrismaError, ServiceError } from "@gafus/core/errors";
import { invalidateStepsContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import type { RegisterTrainerVideoInput } from "./schemas";

const EXTERNAL_VIDEO_PATTERNS = [
  /youtube\.com/,
  /youtu\.be/,
  /rutube\.ru/,
  /vimeo\.com/,
  /vk\.com\/video/,
  /vkvideo\.ru/,
];

function isExternalVideoUrl(url: string): boolean {
  return EXTERNAL_VIDEO_PATTERNS.some((p) => p.test(url));
}

function isCdnVideoUrl(url: string): boolean {
  return (
    url.includes("gafus-media.storage.yandexcloud.net") ||
    url.includes("storage.yandexcloud.net/gafus-media")
  );
}

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
  repo: TrainerVideoPersistencePort,
  input: RegisterTrainerVideoInput,
): Promise<ActionResult & { data?: TrainerVideoDto }> {
  try {
    const video = await repo.createTrainerVideoRow(input);

    const dto: TrainerVideoDto = {
      id: video.id,
      trainerId: video.trainerId,
      relativePath: video.relativePath,
      originalName: video.originalName,
      displayName: video.displayName,
      mimeType: video.mimeType,
      fileSize: Number(video.fileSize),
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

/** Помечает зарегистрированное видео ошибкой, если задача не попала в очередь обработки. */
export async function markTrainerVideoTranscodingFailed(
  repo: TrainerVideoPersistencePort,
  videoId: string,
  errorMessage: string,
): Promise<void> {
  await repo.markTrainerVideoTranscodingFailedRow(videoId, errorMessage);
}

/**
 * Возвращает данные для удаления видео из CDN. App вызывает CDN delete, затем deleteTrainerVideoRecord.
 */
export async function getDeletePayload(
  repo: TrainerVideoPersistencePort,
  videoId: string,
  requesterId: string,
  requesterRole: string,
): Promise<ActionResult & { data?: GetDeletePayloadResult }> {
  try {
    const video = await repo.readTrainerVideoDeleteRow(videoId);

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
  repo: TrainerVideoPersistencePort,
  videoId: string,
  fullCdnUrl: string | null,
): Promise<ActionResult> {
  try {
    if (fullCdnUrl) {
      // Capture IDs before updating videoUrl so every reused step can be
      // invalidated even if subsequent video-record cleanup fails.
      const affectedSteps = await repo.clearTrainerStepVideoReferences(videoId, fullCdnUrl);

      invalidateStepsContentCache(affectedSteps);
      if (affectedSteps.length > 0) await publishCourseContentChange();
      await repo.clearTrainerTemplateVideoReferences(videoId, fullCdnUrl);
    }

    await repo.deleteTrainerVideoRow(videoId);

    logger.success("Запись видео удалена из БД", { videoId });
    return { success: true };
  } catch (err: unknown) {
    try {
      handlePrismaError(err, "Видео");
    } catch (serviceError) {
      const msg =
        serviceError instanceof ServiceError ? serviceError.message : "Не удалось удалить видео";
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
  repo: TrainerVideoPersistencePort,
  videoId: string,
  trainerId: string,
  displayName: string | null,
): Promise<ActionResult> {
  try {
    const video = await repo.readTrainerVideoOwnerRow(videoId);

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

    if (!(await repo.renameTrainerVideoForOwner(videoId, trainerId, displayName)))
      return { success: false, error: "Видео не найдено" };

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
  repo: TrainerVideoPersistencePort,
  trainerId: string,
  options: { forAdmin?: boolean } = {},
): Promise<TrainerVideoDto[]> {
  const videos = await repo.readTrainerVideosRows(trainerId, Boolean(options.forAdmin));

  return videos.map((video) => ({
    id: video.id,
    trainerId: video.trainerId,
    relativePath: video.relativePath,
    originalName: video.originalName,
    displayName: video.displayName,
    mimeType: video.mimeType,
    fileSize: Number(video.fileSize),
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
  ttlMinutes: number = VIDEO_PLAYBACK_TOKEN_TTL_MINUTES,
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
  repo: TrainerVideoPersistencePort,
  videoIds: string[],
): Promise<ActionResult & { data?: VideoStatusResult[] }> {
  if (videoIds.length === 0) {
    return { success: true, data: [] };
  }

  try {
    const videos = await repo.readTrainerVideoStatusRows(videoIds);

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
        serviceError instanceof ServiceError ? serviceError.message : "Не удалось получить статусы";
      return { success: false, error: msg };
    }
    const error = toError(err);
    logger.error("Ошибка получения статусов видео", error, { videoIds });
    return { success: false, error: error.message };
  }
}

export interface VideoMetadata {
  thumbnailPath: string | null;
  videoId: string | null;
  transcodingStatus: TranscodingStatus | null;
  isExternal: boolean;
}

/**
 * Получает метаданные видео по videoUrl.
 * Для CDN — извлекает videoId и ищет по id; для внешних URL — возвращает isExternal: true.
 */
export async function getVideoMetadataByUrl(
  repo: TrainerVideoPersistencePort,
  videoUrl: string | null | undefined,
): Promise<VideoMetadata> {
  if (!videoUrl) {
    return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: false };
  }
  if (isExternalVideoUrl(videoUrl)) {
    return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: true };
  }
  if (!isCdnVideoUrl(videoUrl)) {
    return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: false };
  }
  const videoId = extractVideoIdFromCdnUrl(videoUrl);
  if (!videoId) {
    return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: false };
  }
  try {
    const video = await repo.readTrainerVideoMetadataRow(videoId);
    if (!video) {
      return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: false };
    }
    return {
      thumbnailPath: video.thumbnailPath,
      videoId: video.id,
      transcodingStatus: video.transcodingStatus,
      isExternal: false,
    };
  } catch (error) {
    logger.error("Ошибка при поиске видео", error as Error, { videoUrl });
    return { thumbnailPath: null, videoId: null, transcodingStatus: null, isExternal: false };
  }
}

/**
 * Получает videoId, hlsManifestPath, thumbnailPath для скачивания HLS.
 */
export async function getVideoIdAndPathsFromUrl(
  repo: TrainerVideoPersistencePort,
  videoUrl: string,
): Promise<{
  success: boolean;
  videoId?: string;
  hlsManifestPath?: string;
  thumbnailPath?: string;
  error?: string;
}> {
  try {
    if (!videoUrl) return { success: false, error: "videoUrl не предоставлен" };
    if (!isCdnVideoUrl(videoUrl)) return { success: false, error: "URL не является CDN видео" };
    const videoId = extractVideoIdFromCdnUrl(videoUrl);
    if (!videoId) return { success: false, error: "Не удалось извлечь videoId из URL" };

    const video = await repo.readTrainerVideoManifestRow(videoId);
    if (!video) {
      logger.warn("Видео не найдено в БД", { videoId });
      return { success: false, error: "Видео не найдено" };
    }
    if (video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      logger.warn("Видео ещё не транскодировано", {
        videoId,
        transcodingStatus: video.transcodingStatus,
      });
      return { success: false, error: "Видео ещё обрабатывается" };
    }
    return {
      success: true,
      videoId,
      hlsManifestPath: video.hlsManifestPath,
      thumbnailPath: video.thumbnailPath ?? undefined,
    };
  } catch (error) {
    logger.error("Ошибка в getVideoIdAndPathsFromUrl", error as Error, { videoUrl });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}

/**
 * Проверяет статус видео для воспроизведения (только чтение из БД).
 * Web вызывает getSignedVideoUrl после проверки — сессия и headers остаются в web.
 */
export async function getVideoForPlaybackCheck(
  repo: TrainerVideoPersistencePort,
  videoId: string,
): Promise<{ transcodingStatus: string } | null> {
  const video = await repo.readTrainerVideoPlaybackRow(videoId);
  return video;
}
