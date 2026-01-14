"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { deleteFileFromCDN, deleteFolderFromCDN } from "@gafus/cdn-upload";
import { createTrainerPanelLogger } from "@gafus/logger";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-delete-video");

const deleteVideoSchema = z.object({
  videoId: z.string().min(1, "ID видео обязателен"),
});

/**
 * Удаляет видео тренера из БД и CDN
 */
export async function deleteTrainerVideo(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role || "")) {
      return { success: false, error: "Недостаточно прав" };
    }

    const parsed = deleteVideoSchema.safeParse({
      videoId: formData.get("videoId"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(", "),
      };
    }

    const { videoId } = parsed.data;
    const trainerId = session.user.id;

    logger.info("Начало удаления видео", { videoId, trainerId });

    // Получаем запись видео
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        trainerId: true,
        relativePath: true,
        originalName: true,
        hlsManifestPath: true,
      },
    });

    if (!video) {
      return { success: false, error: "Видео не найдено" };
    }

    // Проверяем права доступа
    const isAdmin = session.user.role === "ADMIN";
    const isModerator = session.user.role === "MODERATOR";

    // Проверяем владельца (только для обычных тренеров)
    if (!isAdmin && !isModerator && video.trainerId !== trainerId) {
      logger.warn("Попытка удаления чужого видео", { videoId, trainerId, ownerId: video.trainerId });
      return { success: false, error: "Недостаточно прав для удаления этого видео" };
    }

    // Логируем удаление администратором/модератором
    if (isAdmin || isModerator) {
      logger.info("Удаление видео администратором/модератором", {
        videoId,
        deletedBy: trainerId,
        role: session.user.role,
        ownerId: video.trainerId,
        originalName: video.originalName,
      });
    }

    // КРИТИЧНО: Сначала удаляем файлы из CDN
    // Если удаление из CDN не удалось, НЕ удаляем из БД, чтобы избежать "мусора" на CDN
    
    try {
      // Если видео было транскодировано в HLS, удаляем всю папку с видео
      if (video.hlsManifestPath) {
        // Извлекаем путь к папке видео из hlsManifestPath
        // Пример: "trainers/{trainerId}/videocourses/{videoId}/hls/playlist.m3u8" 
        // -> "trainers/{trainerId}/videocourses/{videoId}/"
        const videoFolder = video.hlsManifestPath.replace("/hls/playlist.m3u8", "");
        
        logger.info("Начало удаления папки с HLS видео из CDN", { 
          videoFolder,
          hlsManifestPath: video.hlsManifestPath,
        });
        
        const deletedCount = await deleteFolderFromCDN(videoFolder);
        
        logger.success("Папка с HLS видео успешно удалена из CDN", { 
          videoFolder,
          deletedFilesCount: deletedCount,
        });
      } else if (video.relativePath && video.relativePath.trim().length > 0) {
        // Старые видео без HLS - удаляем оригинальный файл
        logger.info("Начало удаления оригинального файла из CDN", { 
          relativePath: video.relativePath,
        });
        
        await deleteFileFromCDN(video.relativePath);
        
        logger.success("Оригинальный файл успешно удалён из CDN", { 
          relativePath: video.relativePath,
        });
      } else {
        logger.warn("Нет путей для удаления из CDN", { 
          videoId,
          hlsManifestPath: video.hlsManifestPath,
          relativePath: video.relativePath,
        });
      }
    } catch (cdnError) {
      logger.error("КРИТИЧЕСКАЯ ОШИБКА: Не удалось удалить файлы из CDN", cdnError as Error, {
        videoId,
        originalName: video.originalName,
        hlsManifestPath: video.hlsManifestPath,
        relativePath: video.relativePath,
      });

      logger.error(
        `Failed to delete video from CDN`,
        cdnError instanceof Error ? cdnError : new Error(String(cdnError)),
        {
          operation: "deleteTrainerVideo",
          action: "deleteTrainerVideo",
          videoId,
          hlsManifestPath: video.hlsManifestPath,
          relativePath: video.relativePath,
          error: cdnError instanceof Error ? cdnError.message : String(cdnError),
          tags: ["trainer-videos", "delete", "cdn-error", "critical"],
        }
      );

      // НЕ удаляем из БД, если CDN недоступен - это критическая ошибка
      return {
        success: false,
        error: "Не удалось удалить файлы из хранилища. Попробуйте позже или обратитесь в поддержку.",
      };
    }

    // Очищаем videoUrl во всех шагах, которые используют это видео
    logger.info("Очищаем ссылки на видео в шагах", { relativePath: video.relativePath, videoId });

    // Формируем варианты URL для поиска
    // VideoSelector сохраняет полный CDN URL: https://gafus-media.storage.yandexcloud.net/{relativePath}
    const cdnBaseUrl = "https://gafus-media.storage.yandexcloud.net/";
    const fullCdnUrl = `${cdnBaseUrl}${video.relativePath}`;

    // Обновляем Step (ищем по videoId в URL или по полному URL)
    const updatedSteps = await prisma.step.updateMany({
      where: {
        OR: [
          { videoUrl: { contains: videoId } },
          { videoUrl: fullCdnUrl },
        ],
      },
      data: {
        videoUrl: null,
      },
    });

    // Обновляем StepTemplate
    const updatedTemplates = await prisma.stepTemplate.updateMany({
      where: {
        OR: [
          { videoUrl: { contains: videoId } },
          { videoUrl: fullCdnUrl },
        ],
      },
      data: {
        videoUrl: null,
      },
    });

    logger.info("Ссылки на видео очищены", {
      videoId,
      updatedSteps: updatedSteps.count,
      updatedTemplates: updatedTemplates.count,
    });

    // Только после очистки ссылок удаляем запись из БД
    await prisma.trainerVideo.delete({
      where: { id: videoId },
    });

    logger.success("Видео успешно удалено из БД и CDN", {
      videoId,
      originalName: video.originalName,
      hlsManifestPath: video.hlsManifestPath,
      relativePath: video.relativePath,
    });

    revalidatePath("/main-panel/my-videos");
    revalidatePath("/trainings/[courseType]/[day]", "page");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления видео", error as Error);

    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "deleteTrainerVideo",
        action: "deleteTrainerVideo",
        tags: ["trainer-videos", "delete"],
      }
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось удалить видео",
    };
  }
}

