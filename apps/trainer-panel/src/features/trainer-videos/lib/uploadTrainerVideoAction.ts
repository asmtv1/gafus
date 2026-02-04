"use server";

import { createId } from "@paralleldrive/cuid2";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { uploadFileToCDN } from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";

import { registerTrainerVideo } from "./registerTrainerVideo";

import type { TrainerVideoUploadResult, VideoTranscodingJobData } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-trainer-videos-action");

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

const metadataSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export async function uploadTrainerVideoAction(
  formData: FormData,
): Promise<TrainerVideoUploadResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован", status: 401 };
  }

  if (!["TRAINER", "ADMIN"].includes(session.user.role || "")) {
    return { success: false, error: "Недостаточно прав", status: 403 };
  }

  const file = formData.get("video");
  if (!(file instanceof File)) {
    return { success: false, error: "Файл обязателен", status: 400 };
  }

  const parsedMetadata = metadataSchema.safeParse({
    name: file.name || "video",
    size: file.size,
  });

  if (!parsedMetadata.success) {
    return {
      success: false,
      error: parsedMetadata.error.errors.map((err) => err.message).join("; "),
      status: 400,
    };
  }

  const extension = getExtension(file);
  const mimeType = getMimeType(file, extension);

  if (!ACCEPTED_VIDEO_TYPES.includes(mimeType)) {
    return { success: false, error: "Недопустимый формат видео", status: 400 };
  }

  const trainerId = session.user.id;
  const id = createId();

  // Путь с CUID (TrainerVideo.id) — один идентификатор в CDN и БД
  const objectKey = `trainers/${trainerId}/videocourses/${id}/original.${extension}`;

  try {
    logger.info("Начало загрузки видео в CDN", {
      trainerId,
      videoId: id,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
    });

    const cdnUrl = await uploadFileToCDN(file, objectKey);
    const storedRelativePath = `uploads/${objectKey}`;

    const video = await registerTrainerVideo({
      id,
      trainerId,
      relativePath: storedRelativePath,
      originalName: file.name,
      mimeType,
      fileSize: file.size,
      durationSec: null,
    });

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
      // Если очередь недоступна (например, на build), логируем но не падаем
      logger.warn("Не удалось добавить задачу в очередь транскодирования", {
        error: queueError instanceof Error ? queueError.message : "Unknown error",
        videoId: video.id,
      });
    }

    return { success: true, video, cdnUrl, status: 201 };
  } catch (error) {
    logger.error("Ошибка загрузки видео", error as Error);

    logger.error(
      error instanceof Error ? error.message : "Unknown error",
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

function getExtension(file: File): string {
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

function getMimeType(file: File, extension: string): string {
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
