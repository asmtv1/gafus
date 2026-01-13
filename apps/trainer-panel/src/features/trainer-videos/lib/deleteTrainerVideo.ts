"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { deleteFileFromCDN } from "@gafus/cdn-upload";
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

    if (!["TRAINER", "ADMIN"].includes(session.user.role || "")) {
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
      },
    });

    if (!video) {
      return { success: false, error: "Видео не найдено" };
    }

    // Проверяем владельца
    if (video.trainerId !== trainerId) {
      logger.warn("Попытка удаления чужого видео", { videoId, trainerId, ownerId: video.trainerId });
      return { success: false, error: "Недостаточно прав для удаления этого видео" };
    }

    // КРИТИЧНО: Сначала удаляем файл из CDN
    // Если удаление из CDN не удалось, НЕ удаляем из БД, чтобы избежать "мусора" на CDN
    
    // Проверяем формат пути перед удалением
    if (!video.relativePath || video.relativePath.trim().length === 0) {
      const error = new Error("Некорректный relativePath для удаления");
      logger.error("Некорректный relativePath для удаления", error, {
        videoId,
        relativePath: video.relativePath,
      });
      return {
        success: false,
        error: "Некорректный путь к файлу. Невозможно удалить видео.",
      };
    }

    logger.info("Начало удаления файла из CDN", { relativePath: video.relativePath });
    try {
      await deleteFileFromCDN(video.relativePath);
      logger.success("Файл успешно удалён из CDN", { relativePath: video.relativePath });
    } catch (cdnError) {
      logger.error("КРИТИЧЕСКАЯ ОШИБКА: Не удалось удалить файл из CDN", cdnError as Error, {
        relativePath: video.relativePath,
        videoId,
        originalName: video.originalName,
      });

      logger.error(
        `Failed to delete video from CDN: ${video.relativePath}`,
        cdnError instanceof Error ? cdnError : new Error(String(cdnError)),
        {
          operation: "deleteTrainerVideo",
          action: "deleteTrainerVideo",
          videoId,
          relativePath: video.relativePath,
          error: cdnError instanceof Error ? cdnError.message : String(cdnError),
          tags: ["trainer-videos", "delete", "cdn-error", "critical"],
        }
      );

      // НЕ удаляем из БД, если CDN недоступен - это критическая ошибка
      return {
        success: false,
        error: "Не удалось удалить файл из хранилища. Попробуйте позже или обратитесь в поддержку.",
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

