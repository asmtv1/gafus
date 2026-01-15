"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { trainingTypeSchema } from "../validation/schemas";
import { getCurrentUserId } from "@/utils";
import type { FullCourseData } from "../offline/types";
import { getRelativePathFromCDNUrl } from "@gafus/cdn-upload";

const logger = createWebLogger("web-offline-course-actions");

// Получение версии курса (updatedAt)
export async function getCourseVersion(
  courseType: string,
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const safeType = trainingTypeSchema.parse(courseType);

    const course = await prisma.course.findFirst({
      where: { type: safeType },
      select: { updatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    return {
      success: true,
      version: course.updatedAt.toISOString(),
    };
  } catch (error) {
    logger.error("Error getting course version", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

// Проверка обновлений курса
export async function checkCourseUpdates(
  courseType: string,
  clientVersion: string,
): Promise<{
  success: boolean;
  hasUpdates?: boolean;
  serverVersion?: string;
  error?: string;
}> {
  try {
    const versionResult = await getCourseVersion(courseType);

    if (!versionResult.success || !versionResult.version) {
      return {
        success: false,
        error: versionResult.error || "Не удалось получить версию курса",
      };
    }

    const serverVersion = versionResult.version;
    const clientDate = new Date(clientVersion);
    const serverDate = new Date(serverVersion);

    const hasUpdates = serverDate.getTime() > clientDate.getTime();

    return {
      success: true,
      hasUpdates,
      serverVersion,
    };
  } catch (error) {
    logger.error("Error checking course updates", error as Error, {
      courseType,
      clientVersion,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

// Скачивание полного курса
export async function downloadFullCourse(
  courseType: string,
): Promise<{ success: boolean; data?: FullCourseData; error?: string }> {
  try {
    const safeType = trainingTypeSchema.parse(courseType);
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: "Пользователь не авторизован" };
    }

    logger.info("Downloading full course", { courseType: safeType, userId });

    // Получаем полные данные курса
    const course = await prisma.course.findFirst({
      where: { type: safeType },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        shortDesc: true,
        duration: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        avgRating: true,
        trainingLevel: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            username: true,
          },
        },
        videoUrl: true,
        equipment: true,
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                id: true,
                title: true,
                description: true,
                equipment: true,
                type: true,
                stepLinks: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    order: true,
                    step: {
                      select: {
                        id: true,
                        title: true,
                        description: true,
                        durationSec: true,
                        estimatedDurationSec: true,
                        videoUrl: true,
                        imageUrls: true,
                        pdfUrls: true,
                        type: true,
                        checklist: true,
                        requiresVideoReport: true,
                        requiresWrittenFeedback: true,
                        hasTestQuestions: true,
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

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    // Формируем структуру данных курса
    const trainingDays = course.dayLinks.map((dayLink) => ({
      id: dayLink.id,
      order: dayLink.order,
      title: dayLink.day.title,
      description: dayLink.day.description || "",
      equipment: dayLink.day.equipment || "",
      type: dayLink.day.type,
      steps: dayLink.day.stepLinks.map((stepLink) => ({
        id: stepLink.step.id,
        order: stepLink.order,
        title: stepLink.step.title,
        description: stepLink.step.description || "",
        type: stepLink.step.type || "TRAINING",
        durationSec: stepLink.step.durationSec,
        estimatedDurationSec: stepLink.step.estimatedDurationSec,
        videoUrl: stepLink.step.videoUrl,
        imageUrls: stepLink.step.imageUrls,
        pdfUrls: stepLink.step.pdfUrls,
        checklist: stepLink.step.checklist,
        requiresVideoReport: stepLink.step.requiresVideoReport,
        requiresWrittenFeedback: stepLink.step.requiresWrittenFeedback,
        hasTestQuestions: stepLink.step.hasTestQuestions,
      })),
    }));

    // Собираем все URL медиафайлов
    const videoUrls: string[] = [];
    const imageUrls: string[] = [];
    const pdfUrls: string[] = [];

    // Видео курса
    if (course.videoUrl) {
      videoUrls.push(course.videoUrl);
    }

    // Логотип курса
    if (course.logoImg) {
      imageUrls.push(course.logoImg);
    }

    // Медиафайлы из шагов
    for (const day of trainingDays) {
      for (const step of day.steps) {
        if (step.videoUrl) {
          videoUrls.push(step.videoUrl);
        }
        imageUrls.push(...step.imageUrls);
        pdfUrls.push(...step.pdfUrls);
      }
    }

    // Удаляем дубликаты
    const uniqueVideoUrls = Array.from(new Set(videoUrls));
    const uniqueImageUrls = Array.from(new Set(imageUrls));
    const uniquePdfUrls = Array.from(new Set(pdfUrls));

    logger.info("Downloading media files", {
      videos: uniqueVideoUrls.length,
      images: uniqueImageUrls.length,
      pdfs: uniquePdfUrls.length,
    });

    // Возвращаем только URL, скачивание будет происходить на клиенте
    const mediaFiles = {
      videos: uniqueVideoUrls,
      images: uniqueImageUrls,
      pdfs: uniquePdfUrls,
    };

    const courseData: FullCourseData = {
      course: {
        id: course.id,
        type: course.type,
        name: course.name,
        description: course.description || "",
        shortDesc: course.shortDesc || "",
        duration: course.duration || "",
        logoImg: course.logoImg,
        isPrivate: course.isPrivate,
        isPaid: course.isPaid,
        avgRating: course.avgRating,
        trainingLevel: course.trainingLevel,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
        authorUsername: course.author.username,
        videoUrl: course.videoUrl,
        equipment: course.equipment,
      },
      trainingDays,
      mediaFiles,
    };

    // Подсчитываем все медиафайлы
    const totalVideos = uniqueVideoUrls.length;
    const totalImages = uniqueImageUrls.length;
    const totalPdfs = uniquePdfUrls.length;
    const totalSteps = trainingDays.reduce((sum, day) => sum + day.steps.length, 0);
    const totalDays = trainingDays.length;

    logger.info("Course data prepared for download", {
      courseId: course.id,
      courseType: course.type,
      daysCount: totalDays,
      totalSteps,
      totalVideos,
      totalImages,
      totalPdfs,
      mediaFilesCount: totalVideos + totalImages + totalPdfs,
      // Детальная информация по дням
      days: trainingDays.map((day) => ({
        dayOrder: day.order,
        dayTitle: day.title,
        stepsCount: day.steps.length,
        videosInDay: day.steps.filter((s) => s.videoUrl).length,
        imagesInDay: day.steps.reduce((sum, s) => sum + s.imageUrls.length, 0),
        pdfsInDay: day.steps.reduce((sum, s) => sum + s.pdfUrls.length, 0),
      })),
    });

    return { success: true, data: courseData };
  } catch (error) {
    logger.error("Error downloading full course", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Получает информацию о HLS манифесте для видео по его URL
 * Используется для офлайн-скачивания видео, которые были транскодированы в HLS
 * @param videoUrl - URL видео (может быть относительным путём или CDN URL)
 * @returns Информация о HLS манифесте или null если видео не найдено или не транскодировано
 */
export async function getVideoHLSInfo(
  videoUrl: string,
): Promise<{
  success: boolean;
  data?: { videoId: string; hlsManifestUrl: string };
  error?: string;
}> {
  try {
    if (!videoUrl || videoUrl.trim() === "") {
      return { success: false, error: "URL видео не указан" };
    }

    // Определяем relativePath из videoUrl
    let relativePath: string;

    // Если это полный CDN URL
    if (
      videoUrl.includes("storage.yandexcloud.net") ||
      videoUrl.includes("gafus-media.storage.yandexcloud.net")
    ) {
      relativePath = getRelativePathFromCDNUrl(videoUrl);
    } else if (videoUrl.startsWith("/uploads/")) {
      // Если это относительный путь, убираем /uploads/
      relativePath = videoUrl.replace(/^\/uploads\//, "");
    } else if (videoUrl.startsWith("uploads/")) {
      // Если путь начинается без слеша
      relativePath = videoUrl;
    } else {
      // Пробуем использовать как есть
      relativePath = videoUrl;
    }

    logger.info("Getting HLS info for video", { videoUrl, relativePath });

    // Ищем TrainerVideo по relativePath
    // relativePath может быть: trainers/{trainerId}/videocourses/{videoId}/original.mp4
    // или trainers/{trainerId}/videocourses/{videoId}/hls/playlist.m3u8
    const trainerVideo = await prisma.trainerVideo.findFirst({
      where: {
        relativePath,
      },
      select: {
        id: true,
        transcodingStatus: true,
        hlsManifestPath: true,
      },
    });

    if (!trainerVideo) {
      logger.warn("TrainerVideo not found", { relativePath });
      return { success: false, error: "Видео не найдено" };
    }

    // Проверяем статус транскодирования
    if (trainerVideo.transcodingStatus !== "COMPLETED") {
      logger.warn("Video not transcoded yet", {
        videoId: trainerVideo.id,
        status: trainerVideo.transcodingStatus,
      });
      return {
        success: false,
        error: `Видео ещё обрабатывается (статус: ${trainerVideo.transcodingStatus})`,
      };
    }

    if (!trainerVideo.hlsManifestPath) {
      logger.warn("HLS manifest path not found", { videoId: trainerVideo.id });
      return { success: false, error: "HLS манифест не найден" };
    }

    // Формируем полный URL к HLS манифесту
    // hlsManifestPath хранится как: trainers/{trainerId}/videocourses/{videoId}/hls/playlist.m3u8
    // Для скачивания нужен полный CDN URL: https://storage.yandexcloud.net/gafus-media/uploads/{hlsManifestPath}
    const hlsManifestUrl = `https://storage.yandexcloud.net/gafus-media/uploads/${trainerVideo.hlsManifestPath}`;

    logger.info("HLS info retrieved successfully", {
      videoId: trainerVideo.id,
      hlsManifestUrl,
    });

    return {
      success: true,
      data: {
        videoId: trainerVideo.id,
        hlsManifestUrl,
      },
    };
  } catch (error) {
    logger.error("Error getting video HLS info", error as Error, { videoUrl });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
