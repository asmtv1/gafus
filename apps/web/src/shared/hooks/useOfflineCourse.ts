"use client";

import { useState, useCallback, useEffect } from "react";
import { createWebLogger } from "@gafus/logger";
import {
  saveOfflineCourse,
  getOfflineCourseByType,
  deleteOfflineCourse,
  isCourseDownloaded,
  isCourseDownloadedByType,
  getAllDownloadedCourses,
} from "@shared/lib/offline/offlineCourseStorage";
import { useOfflineStore } from "@shared/stores/offlineStore";
import type { OfflineCourse } from "@shared/lib/offline/types";
import {
  downloadFullCourse,
  checkCourseUpdates,
} from "@shared/lib/actions/offlineCourseActions";
import { saveCourseHtmlPagesOnDownload } from "@shared/lib/offline/htmlPageStorage";
import { isOnline } from "@shared/utils/offlineCacheUtils";

const logger = createWebLogger("web-use-offline-course");

interface UpdateCourseResult {
  success: boolean;
  hasUpdates?: boolean;
  message?: string;
  error?: string;
}

interface UseOfflineCourseResult {
  isDownloaded: (courseId: string) => Promise<boolean>;
  isDownloadedByType: (courseType: string) => Promise<boolean>;
  downloadCourse: (courseType: string) => Promise<{ success: boolean; error?: string }>;
  updateCourse: (courseType: string) => Promise<UpdateCourseResult>;
  deleteCourse: (courseId: string) => Promise<{ success: boolean; error?: string }>;
  isDownloading: boolean;
  downloadProgress: number;
  isUpdating: boolean;
  downloadedCourses: OfflineCourse[];
  refreshDownloadedCourses: () => Promise<void>;
}

// Проверка, является ли URL видео с нашего CDN
function isCDNVideo(url: string): boolean {
  if (!url || url.trim() === "") {
    return false;
  }

  // Проверяем оба формата CDN URL
  return (
    url.includes("gafus-media.storage.yandexcloud.net") ||
    url.includes("storage.yandexcloud.net/gafus-media")
  );
}

// Проверка, является ли URL внешним видео-сервисом (YouTube, RuTube, VK и т.д.)
// CDN видео НЕ считается внешним, так как его можно скачать
function isExternalVideoService(url: string): boolean {
  if (!url || url.trim() === "") {
    return false;
  }

  // Если это CDN видео, то это не внешний сервис
  if (isCDNVideo(url)) {
    return false;
  }

  const externalVideoPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /rutube\.ru/,
    /vimeo\.com/,
    /vk\.com\/video/,
    /vkvideo\.ru/,
  ];

  return externalVideoPatterns.some((pattern) => pattern.test(url));
}

function getCdnProxyUrl(url: string): string {
  if (url.startsWith("https://storage.yandexcloud.net/gafus-media/")) {
    const relativePath = url.replace("https://storage.yandexcloud.net/gafus-media/", "");
    return `/${relativePath}`;
  }

  if (url.startsWith("https://gafus-media.storage.yandexcloud.net/")) {
    const relativePath = url.replace("https://gafus-media.storage.yandexcloud.net/", "");
    return `/${relativePath}`;
  }

  return url;
}

// Скачивание медиафайла на клиенте
async function downloadMediaFile(url: string): Promise<Blob | null> {
  try {
    if (!url || url.trim() === "") {
      return null;
    }

    // Пропускаем внешние видео-сервисы (их нельзя скачать напрямую из-за CORS)
    if (isExternalVideoService(url)) {
      logger.info("Skipping external video service URL", { url });
      return null;
    }

    const response = await fetch(getCdnProxyUrl(url), {
      headers: {
        "X-Gafus-Background-Download": "1",
      },
    });
    if (!response.ok) {
      logger.warn("Failed to download media file", { url, status: response.status });
      return null;
    }

    return await response.blob();
  } catch (error) {
    logger.error("Error downloading media file", error as Error, { url });
    return null;
  }
}

// Скачивание всех медиафайлов курса на клиенте
async function downloadAllMediaFiles(
  videoUrls: string[],
  imageUrls: string[],
  pdfUrls: string[],
  onProgress?: (progress: number) => void,
): Promise<{
  videos: Record<string, Blob>;
  images: Record<string, Blob>;
  pdfs: Record<string, Blob>;
}> {
  const videos: Record<string, Blob> = {};
  const images: Record<string, Blob> = {};
  const pdfs: Record<string, Blob> = {};

  const allUrls = [
    ...videoUrls.map((url) => ({ url, type: "video" as const })),
    ...imageUrls.map((url) => ({ url, type: "image" as const })),
    ...pdfUrls.map((url) => ({ url, type: "pdf" as const })),
  ];

  let completed = 0;
  const total = allUrls.length;

  for (const { url, type } of allUrls) {
    const blob = await downloadMediaFile(url);
    if (blob) {
      if (type === "video") {
        videos[url] = blob;
      } else if (type === "image") {
        images[url] = blob;
      } else if (type === "pdf") {
        pdfs[url] = blob;
      }
    }

    completed++;
    if (onProgress) {
      onProgress((completed / total) * 100);
    }
  }

  return { videos, images, pdfs };
}

export function useOfflineCourse(): UseOfflineCourseResult {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadedCourses, setDownloadedCourses] = useState<OfflineCourse[]>([]);

  // Загружаем список скачанных курсов при монтировании
  useEffect(() => {
    refreshDownloadedCourses();
  }, []);

  const refreshDownloadedCourses = useCallback(async () => {
    try {
      const courses = await getAllDownloadedCourses();
      setDownloadedCourses(courses);
    } catch (error) {
      logger.error("Failed to refresh downloaded courses", error as Error);
    }
  }, []);

  const checkDownloaded = useCallback(async (courseId: string): Promise<boolean> => {
    try {
      return await isCourseDownloaded(courseId);
    } catch (error) {
      logger.error("Failed to check if course is downloaded", error as Error, { courseId });
      return false;
    }
  }, []);

  const checkDownloadedByType = useCallback(async (courseType: string): Promise<boolean> => {
    try {
      return await isCourseDownloadedByType(courseType);
    } catch (error) {
      logger.error("Failed to check if course is downloaded by type", error as Error, { courseType });
      return false;
    }
  }, []);

  const downloadCourse = useCallback(
    async (courseType: string): Promise<{ success: boolean; error?: string }> => {
      if (isDownloading) {
        return { success: false, error: "Скачивание уже выполняется" };
      }

      setIsDownloading(true);
      setDownloadProgress(0);
      useOfflineStore.getState().startDownload();

      try {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        logger.info("Starting course download", { courseType });

        // Получаем данные курса с сервера
        const result = await downloadFullCourse(courseType);

        if (!result.success || !result.data) {
          return { success: false, error: result.error || "Не удалось загрузить курс" };
        }

        const courseData = result.data;

        // Собираем все URL медиафайлов
        const videoUrls: string[] = [];
        const imageUrls: string[] = [];
        const pdfUrls: string[] = [];

        // Видео курса
        if (courseData.course.videoUrl) {
          videoUrls.push(courseData.course.videoUrl);
        }

        // Логотип курса
        if (courseData.course.logoImg) {
          imageUrls.push(courseData.course.logoImg);
        }

        // Медиафайлы из шагов
        for (const day of courseData.trainingDays) {
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

        const totalVideos = uniqueVideoUrls.length;
        const totalImages = uniqueImageUrls.length;
        const totalPdfs = uniquePdfUrls.length;
        const totalDays = courseData.trainingDays.length;
        const totalSteps = courseData.trainingDays.reduce((sum, day) => sum + day.steps.length, 0);

        logger.info("Downloading media files", {
          courseType,
          courseId: courseData.course.id,
          totalDays,
          totalSteps,
          totalVideos,
          totalImages,
          totalPdfs,
          totalMediaFiles: totalVideos + totalImages + totalPdfs,
        });

        // Разделяем видео на скачиваемые и внешние (YouTube и т.д.)
        const downloadableVideoUrls: string[] = [];
        const externalVideoUrls: string[] = [];

        for (const url of uniqueVideoUrls) {
          if (isExternalVideoService(url)) {
            externalVideoUrls.push(url);
          } else {
            downloadableVideoUrls.push(url);
          }
        }

        // Скачиваем только доступные медиафайлы
        const mediaFiles = await downloadAllMediaFiles(
          downloadableVideoUrls,
          uniqueImageUrls,
          uniquePdfUrls,
          (progress) => {
            setDownloadProgress(progress);
          },
        );

        // Логируем результаты скачивания
        const downloadedVideos = Object.keys(mediaFiles.videos).length;
        const downloadedImages = Object.keys(mediaFiles.images).length;
        const downloadedPdfs = Object.keys(mediaFiles.pdfs).length;
        const skippedVideos = downloadableVideoUrls.length - downloadedVideos;
        
        logger.info("Media files download completed", {
          courseType,
          courseId: courseData.course.id,
          downloadedVideos,
          downloadedImages,
          downloadedPdfs,
          skippedVideos,
          externalVideos: externalVideoUrls.length,
          totalDownloaded: downloadedVideos + downloadedImages + downloadedPdfs,
        });

        // Сохраняем URL внешних видео отдельно (для офлайн-доступа через iframe)
        const externalVideos: Record<string, string> = {};
        for (const url of externalVideoUrls) {
          externalVideos[url] = url; // Сохраняем URL как ключ и значение
        }

        // Формируем структуру для сохранения
        const offlineCourse: OfflineCourse = {
          courseId: courseData.course.id,
          courseType: courseData.course.type,
          version: courseData.course.updatedAt,
          downloadedAt: Date.now(),
          course: {
            metadata: courseData.course,
            trainingDays: courseData.trainingDays,
            steps: courseData.trainingDays.flatMap((day) => day.steps),
          },
          mediaFiles: {
            ...mediaFiles,
            externalVideos, // Добавляем внешние видео URL
          },
        };

        // Сохраняем в IndexedDB
        await saveOfflineCourse(offlineCourse);

        logger.info("Course saved to IndexedDB, starting HTML pages download", {
          courseId: courseData.course.id,
          courseType: courseData.course.type,
          daysCount: courseData.trainingDays.length,
        });

        // Сохраняем HTML страниц курса в IndexedDB
        try {
          await saveCourseHtmlPagesOnDownload(
            courseData.course.type,
            courseData.trainingDays.map((day) => ({ id: day.id }))
          );
          logger.info("HTML pages download completed", {
            courseType: courseData.course.type,
          });
        } catch (error) {
          logger.error("Failed to save HTML pages", error as Error, {
            courseType: courseData.course.type,
          });
          // Не прерываем процесс скачивания, если HTML не сохранился
        }

        logger.info("Course downloaded successfully", {
          courseId: courseData.course.id,
          courseType: courseData.course.type,
        });

        // Обновляем список скачанных курсов
        await refreshDownloadedCourses();

        return { success: true };
      } catch (error) {
        logger.error("Error downloading course", error as Error, { courseType });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Неизвестная ошибка",
        };
      } finally {
        setIsDownloading(false);
        setDownloadProgress(0);
        useOfflineStore.getState().finishDownload();
      }
    },
    [isDownloading, refreshDownloadedCourses],
  );

  const updateCourse = useCallback(
    async (courseType: string): Promise<UpdateCourseResult> => {
      if (isUpdating) {
        return { success: false, error: "Обновление уже выполняется" };
      }

      // Проверяем онлайн-статус перед обновлением
      if (!isOnline()) {
        return {
          success: false,
          error: "Нет подключения к интернету. Обновление курса требует подключения к сети.",
        };
      }

      setIsUpdating(true);

      try {
        // Получаем текущую версию скачанного курса
        const offlineCourse = await getOfflineCourseByType(courseType);
        if (!offlineCourse) {
          return { success: false, error: "Курс не найден в офлайн-хранилище" };
        }

        // Проверяем обновления
        const updateCheck = await checkCourseUpdates(courseType, offlineCourse.version);

        if (!updateCheck.success) {
          return {
            success: false,
            error: updateCheck.error || "Не удалось проверить обновления",
          };
        }

        if (!updateCheck.hasUpdates) {
          return {
            success: true,
            hasUpdates: false,
            message: "Курс уже актуален. Обновлений нет.",
          };
        }

        logger.info("Course has updates, downloading new version", {
          courseType,
          oldVersion: offlineCourse.version,
          newVersion: updateCheck.serverVersion,
        });

        // Скачиваем обновленную версию (используем ту же логику, что и при скачивании)
        const downloadResult = await downloadCourse(courseType);

        if (!downloadResult.success) {
          return {
            success: false,
            error: downloadResult.error || "Не удалось скачать обновленную версию курса",
          };
        }

        logger.info("Course updated successfully", { courseType });

        return {
          success: true,
          hasUpdates: true,
          message: "Курс успешно обновлен",
        };
      } catch (error) {
        logger.error("Error updating course", error as Error, { courseType });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Неизвестная ошибка",
        };
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, downloadCourse],
  );

  const deleteCourse = useCallback(
    async (courseId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await deleteOfflineCourse(courseId);
        logger.info("Course deleted from offline storage", { courseId });

        // Обновляем список скачанных курсов
        await refreshDownloadedCourses();

        return { success: true };
      } catch (error) {
        logger.error("Error deleting course", error as Error, { courseId });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Неизвестная ошибка",
        };
      }
    },
    [refreshDownloadedCourses],
  );

  return {
    isDownloaded: checkDownloaded,
    isDownloadedByType: checkDownloadedByType,
    downloadCourse,
    updateCourse,
    deleteCourse,
    isDownloading,
    downloadProgress,
    isUpdating,
    downloadedCourses,
    refreshDownloadedCourses,
  };
}
