"use client";

import { createWebLogger } from "@gafus/logger";
import { getOfflineCourseByType } from "./offlineCourseStorage";

const logger = createWebLogger("web-offline-integrity-validator");

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Извлекает имена сегментов из манифеста
 */
function extractSegmentNames(manifest: string): string[] {
  const segmentNames: string[] = [];
  const lines = manifest.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Пропускаем комментарии и пустые строки
    if (trimmed && !trimmed.startsWith("#")) {
      // Извлекаем имя файла из пути
      const fileName = trimmed.split("/").pop() || trimmed;
      segmentNames.push(fileName);
    }
  }

  return segmentNames;
}

/**
 * Валидирует структуру манифеста
 */
function validateManifestStructure(manifest: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest || manifest.trim().length === 0) {
    errors.push("Манифест пустой");
    return { isValid: false, errors };
  }

  const lines = manifest.split("\n");
  const hasExtM3u = lines.some((line) => line.trim() === "#EXTM3U");
  if (!hasExtM3u) {
    errors.push("Манифест не содержит #EXTM3U");
  }

  const hasExtInf = lines.some((line) => line.trim().startsWith("#EXTINF:"));
  if (!hasExtInf) {
    errors.push("Манифест не содержит сегментов (#EXTINF:)");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Проверяет целостность офлайн видео
 * @param courseType - Тип курса
 * @param videoId - ID видео
 * @returns Результат валидации
 */
export async function validateOfflineVideo(
  courseType: string,
  videoId: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    logger.info("validateOfflineVideo: Starting validation", { courseType, videoId });

    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      errors.push(`Курс ${courseType} не найден в офлайн-хранилище`);
      return { isValid: false, errors, warnings };
    }

    const hlsVideos = offlineCourse.mediaFiles.hlsVideos;

    // Ищем видео по videoId
    let hlsVideo = null;
    for (const [, video] of Object.entries(hlsVideos)) {
      if (video.videoId === videoId) {
        hlsVideo = video;
        break;
      }
    }

    if (!hlsVideo) {
      errors.push(`Видео с ID ${videoId} не найдено в офлайн-хранилище`);
      return { isValid: false, errors, warnings };
    }

    // Валидация структуры манифеста
    const manifestValidation = validateManifestStructure(hlsVideo.manifest);
    if (!manifestValidation.isValid) {
      errors.push(...manifestValidation.errors);
    }

    // Проверка наличия всех сегментов
    const segmentNames = extractSegmentNames(hlsVideo.manifest);
    const missingSegments: string[] = [];

    for (const segmentName of segmentNames) {
      if (!hlsVideo.segments[segmentName]) {
        missingSegments.push(segmentName);
      }
    }

    if (missingSegments.length > 0) {
      errors.push(
        `Отсутствуют сегменты: ${missingSegments.slice(0, 5).join(", ")}${missingSegments.length > 5 ? ` и еще ${missingSegments.length - 5}` : ""}`,
      );
    }

    // Проверка версии
    if (!hlsVideo.version) {
      warnings.push("Версия видео не указана");
    }

    // Проверка downloadedAt
    if (!hlsVideo.downloadedAt) {
      warnings.push("Дата скачивания не указана");
    }

    const isValid = errors.length === 0;

    logger.info("validateOfflineVideo: Validation completed", {
      courseType,
      videoId,
      isValid,
      errorsCount: errors.length,
      warningsCount: warnings.length,
      segmentsCount: segmentNames.length,
      missingSegmentsCount: missingSegments.length,
    });

    return {
      isValid,
      errors,
      warnings,
    };
  } catch (error) {
    logger.error("validateOfflineVideo: Validation failed", error as Error, {
      courseType,
      videoId,
    });
    errors.push(
      `Ошибка при проверке целостности: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      isValid: false,
      errors,
      warnings,
    };
  }
}
