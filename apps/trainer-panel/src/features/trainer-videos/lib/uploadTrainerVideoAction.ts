import { createId } from "@paralleldrive/cuid2";
import { getServerSession } from "next-auth";
import type { Readable } from "node:stream";
import { z } from "zod";

import { deleteFileFromCDN, uploadReadableStreamToCDN } from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { getErrorMessage } from "@gafus/core/errors";
import { markTrainerVideoTranscodingFailed } from "@gafus/core/services/trainerVideo";
import { createTrainerPanelLogger } from "@gafus/logger";

import { registerTrainerVideo } from "./registerTrainerVideo";
import { MAX_TRAINER_VIDEO_SIZE_BYTES } from "./uploadLimits";

import type { TrainerVideoUploadResult, VideoTranscodingJobData } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-trainer-videos-action");

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

const metadataSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_TRAINER_VIDEO_SIZE_BYTES),
});

export async function uploadTrainerVideoStreamAction({
  name,
  mimeType,
  size,
  stream,
}: {
  name: string;
  mimeType: string;
  size: number;
  stream: Readable;
}): Promise<TrainerVideoUploadResult> {
  return uploadTrainerVideo({
    name,
    mimeType,
    size,
    upload: (objectKey) => uploadReadableStreamToCDN(stream, objectKey, mimeType, size, name),
  });
}

async function uploadTrainerVideo({
  name,
  mimeType: declaredMimeType,
  size,
  upload,
}: {
  name: string;
  mimeType: string;
  size: number;
  upload: (objectKey: string) => Promise<string>;
}): Promise<TrainerVideoUploadResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован", status: 401 };
  }

  if (!["TRAINER", "ADMIN"].includes(session.user.role || "")) {
    return { success: false, error: "Недостаточно прав", status: 403 };
  }

  const parsedMetadata = metadataSchema.safeParse({ name, size });

  if (!parsedMetadata.success) {
    return {
      success: false,
      error: parsedMetadata.error.errors.map((err) => err.message).join("; "),
      status: 400,
    };
  }

  const extension = getExtension({ name, type: declaredMimeType });
  const mimeType = getMimeType({ name, type: declaredMimeType }, extension);

  if (!ACCEPTED_VIDEO_TYPES.includes(mimeType)) {
    return { success: false, error: "Недопустимый формат видео", status: 400 };
  }

  const trainerId = session.user.id;
  const id = createId();

  // Путь с CUID (TrainerVideo.id) — один идентификатор в CDN и БД
  const objectKey = `trainers/${trainerId}/videocourses/${id}/original.${extension}`;
  let uploadCompleted = false;
  let registrationCompleted = false;

  try {
    logger.info("Начало загрузки видео в CDN", {
      trainerId,
      videoId: id,
      fileName: name,
      mimeType,
      fileSize: size,
    });

    const cdnUrl = await upload(objectKey);
    uploadCompleted = true;
    const storedRelativePath = `uploads/${objectKey}`;

    const video = await registerTrainerVideo({
      id,
      trainerId,
      relativePath: storedRelativePath,
      originalName: name,
      mimeType,
      fileSize: size,
      durationSec: null,
    });
    registrationCompleted = true;

    logger.success("Видео успешно загружено", {
      trainerId,
      videoId: id,
      relativePath: storedRelativePath,
    });

    // Добавляем задачу транскодирования в очередь (динамический импорт для избежания ошибок на build)
    try {
      const { videoTranscodingQueue } = await import("@gafus/queues");

      const jobData: VideoTranscodingJobData = {
        videoId: video.id,
        trainerId,
        originalPath: storedRelativePath,
      };

      await videoTranscodingQueue.add("transcode-video", jobData, {
        attempts: 3, // 3 попытки при ошибке
        backoff: {
          type: "exponential",
          delay: 5000, // Начальная задержка 5 секунд
        },
        removeOnComplete: true,
        removeOnFail: false, // Сохраняем провалившиеся задачи для отладки
      });

      logger.info("Задача транскодирования добавлена в очередь", {
        videoId: video.id,
        trainerId,
      });
    } catch (queueError) {
      const queueErrorMessage =
        queueError instanceof Error ? queueError.message : "Ошибка очереди транскодирования";

      await markTrainerVideoTranscodingFailed(
        video.id,
        `Не удалось запустить обработку видео: ${queueErrorMessage}`,
      );
      logger.warn("Не удалось добавить задачу в очередь транскодирования", {
        error: queueErrorMessage,
        videoId: video.id,
      });

      return {
        success: false,
        error: "Видео загружено, но не удалось запустить обработку. Попробуйте позже.",
        status: 503,
      };
    }

    return { success: true, video, cdnUrl, status: 201 };
  } catch (error) {
    if (uploadCompleted && !registrationCompleted) {
      try {
        await deleteFileFromCDN(objectKey);
        logger.info("Удалён незарегистрированный оригинал после ошибки БД", {
          trainerId,
          videoId: id,
          objectKey,
        });
      } catch (cleanupError) {
        logger.warn("Не удалось удалить незарегистрированный оригинал", {
          trainerId,
          videoId: id,
          objectKey,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }

    logger.error("Ошибка загрузки видео", error as Error);

    logger.error(
      getErrorMessage(error, "Не удалось загрузить видео"),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "trainerVideoUpload",
        action: "trainerVideoUpload",
        tags: ["trainer-videos", "upload"],
      },
    );

    return { success: false, error: "Не удалось загрузить видео", status: 500 };
  }
}

function getExtension(file: Pick<File, "name" | "type">): string {
  const nameExt = file.name?.split(".").pop();
  if (nameExt && nameExt.length <= 10) {
    return nameExt.toLowerCase();
  }

  switch (file.type) {
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
  }
}

function getMimeType(file: Pick<File, "name" | "type">, extension: string): string {
  if (file.type) {
    return file.type;
  }

  switch (extension) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return "video/mp4";
  }
}
