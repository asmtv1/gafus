"use client";

import { useState, useEffect, useRef } from "react";
import { createWebLogger } from "@gafus/logger";
import { getOfflineCourseByType } from "./offlineCourseStorage";

const logger = createWebLogger("web-offline-media-resolver");

/**
 * Освобождает blob URL для предотвращения утечек памяти
 */
function revokeBlobUrl(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch (error) {
    logger.warn("Failed to revoke blob URL", { url, error });
  }
}

/**
 * Извлекает имя файла из пути
 */
function getFileNameFromPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "").replace(/^\.\.\//, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

/**
 * Создаёт модифицированный HLS манифест с blob URLs для сегментов
 * @param manifest - Текст манифеста
 * @param segments - Объект с сегментами (ключ = имя файла)
 * @returns Объект с blob URL манифеста и массивом blob URLs сегментов для очистки
 */
function createOfflineHLSManifest(
  manifest: string,
  segments: Record<string, Blob>
): { manifestBlobUrl: string; segmentBlobUrls: string[] } {
  const segmentBlobUrls: string[] = [];
  const lines = manifest.split("\n");

  const modifiedLines = lines.map((line) => {
    const trimmed = line.trim();
    // Пропускаем комментарии и пустые строки
    if (trimmed && !trimmed.startsWith("#")) {
      // Извлекаем имя файла из пути
      const segmentFileName = getFileNameFromPath(trimmed);
      const segmentBlob = segments[segmentFileName];

      if (segmentBlob) {
        // Создаём blob URL для сегмента
        const segmentBlobUrl = URL.createObjectURL(segmentBlob);
        segmentBlobUrls.push(segmentBlobUrl);
        // Заменяем путь на blob URL
        return segmentBlobUrl;
      } else {
        logger.warn("Сегмент не найден в IndexedDB", {
          segmentFileName,
          availableSegments: Object.keys(segments),
        });
        // Возвращаем оригинальный путь, если сегмент не найден
        return trimmed;
      }
    }
    return line;
  });

  const modifiedManifest = modifiedLines.join("\n");
  const manifestBlob = new Blob([modifiedManifest], {
    type: "application/vnd.apple.mpegurl",
  });
  const manifestBlobUrl = URL.createObjectURL(manifestBlob);

  return {
    manifestBlobUrl,
    segmentBlobUrls,
  };
}

/**
 * Получает HLS манифест URL из офлайн-хранилища
 * @param courseType - Тип курса
 * @param mediaUrl - URL видео
 * @returns Blob URL для манифеста или null если не найдено
 */
async function getOfflineHLSManifestUrl(
  courseType: string,
  mediaUrl: string
): Promise<{ manifestBlobUrl: string; segmentBlobUrls: string[] } | null> {
  try {
    logger.info("getOfflineHLSManifestUrl: Starting search", {
      courseType,
      mediaUrl,
    });

    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      return null;
    }

    const hlsVideo = offlineCourse.mediaFiles.hlsVideos[mediaUrl];
    if (!hlsVideo) {
      logger.warn("HLS видео не найдено в IndexedDB", {
        courseType,
        mediaUrl,
        availableHlsVideos: Object.keys(offlineCourse.mediaFiles.hlsVideos),
      });
      return null;
    }

    logger.info("HLS видео найдено в IndexedDB", {
      courseType,
      mediaUrl,
      segmentsCount: Object.keys(hlsVideo.segments).length,
    });

    // Создаём модифицированный манифест с blob URLs
    const result = createOfflineHLSManifest(hlsVideo.manifest, hlsVideo.segments);

    logger.info("HLS манифест создан с blob URLs", {
      courseType,
      mediaUrl,
      segmentBlobUrlsCount: result.segmentBlobUrls.length,
    });

    return result;
  } catch (error) {
    logger.error("getOfflineHLSManifestUrl: Failed to get offline HLS manifest", error as Error, {
      courseType,
      mediaUrl,
    });
    return null;
  }
}

/**
 * Получает медиафайл из офлайн-хранилища по URL (для изображений и PDF)
 * @param courseType - Тип курса
 * @param mediaUrl - URL медиафайла
 * @returns Blob если файл найден, null если нет
 */
async function getOfflineMediaBlob(
  courseType: string,
  mediaUrl: string,
): Promise<Blob | null> {
  try {
    logger.info("getOfflineMediaBlob: Starting search", {
      courseType,
      mediaUrl,
    });

    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      return null;
    }

    // Проверяем изображения
    if (offlineCourse.mediaFiles.images[mediaUrl]) {
      const blob = offlineCourse.mediaFiles.images[mediaUrl];
      logger.info("getOfflineMediaBlob: Found in images", {
        courseType,
        mediaUrl,
        blobSize: blob.size,
        blobType: blob.type,
      });
      return blob;
    }

    // Проверяем PDF
    if (offlineCourse.mediaFiles.pdfs[mediaUrl]) {
      logger.info("getOfflineMediaBlob: Found in PDFs", {
        courseType,
        mediaUrl,
        blobSize: offlineCourse.mediaFiles.pdfs[mediaUrl].size,
      });
      return offlineCourse.mediaFiles.pdfs[mediaUrl];
    }

    logger.warn("getOfflineMediaBlob: Media file not found in IndexedDB", {
      courseType,
      mediaUrl,
    });

    return null;
  } catch (error) {
    logger.error("getOfflineMediaBlob: Failed to get offline media blob", error as Error, {
      courseType,
      mediaUrl,
    });
    return null;
  }
}

/**
 * Хук для получения URL медиафайла с поддержкой офлайн-режима
 * Проверяет IndexedDB и возвращает blob URL если файл скачан, иначе оригинальный URL
 */
export function useOfflineMediaUrl(
  courseType: string | null,
  mediaUrl: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(mediaUrl || null);
  const blobUrlRef = useRef<string | null>(null);
  const segmentBlobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    logger.info("useOfflineMediaUrl: Effect triggered", {
      courseType,
      mediaUrl,
      currentUrl: url,
      hasBlobUrl: !!blobUrlRef.current,
    });

    // Очищаем предыдущие blob URLs если есть
    if (blobUrlRef.current) {
      logger.info("useOfflineMediaUrl: Revoking previous blob URLs", {
        courseType,
        mediaUrl,
        previousBlobUrl: blobUrlRef.current,
        segmentBlobUrlsCount: segmentBlobUrlsRef.current.length,
      });
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    // Очищаем blob URLs сегментов
    for (const segmentBlobUrl of segmentBlobUrlsRef.current) {
      revokeBlobUrl(segmentBlobUrl);
    }
    segmentBlobUrlsRef.current = [];

    if (!mediaUrl || !courseType) {
      logger.info("useOfflineMediaUrl: Missing params, using original URL", {
        courseType,
        mediaUrl,
        hasMediaUrl: !!mediaUrl,
        hasCourseType: !!courseType,
      });
      setUrl(mediaUrl || null);
      return;
    }

    logger.info("useOfflineMediaUrl: Starting blob search", {
      courseType,
      mediaUrl,
    });

    // Сначала проверяем, является ли это HLS видео
    getOfflineHLSManifestUrl(courseType, mediaUrl)
      .then((hlsResult) => {
        if (hlsResult) {
          blobUrlRef.current = hlsResult.manifestBlobUrl;
          segmentBlobUrlsRef.current = hlsResult.segmentBlobUrls;
          logger.info("useOfflineMediaUrl: HLS манифест найден, создан blob URL", {
            courseType,
            mediaUrl,
            manifestBlobUrl: hlsResult.manifestBlobUrl,
            segmentBlobUrlsCount: hlsResult.segmentBlobUrls.length,
          });
          setUrl(hlsResult.manifestBlobUrl);
          return;
        }

        // Если не HLS, пытаемся получить обычный медиафайл
        return getOfflineMediaBlob(courseType, mediaUrl).then((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            blobUrlRef.current = blobUrl;
            logger.info("useOfflineMediaUrl: Blob found, created blob URL", {
              courseType,
              mediaUrl,
              blobSize: blob.size,
              blobType: blob.type,
              blobUrl,
            });
            setUrl(blobUrl);
          } else {
            // Если файл не найден в офлайн-хранилище, возвращаем оригинальный URL
            setUrl(mediaUrl);
          }
        });
      })
      .catch((error) => {
        logger.error("useOfflineMediaUrl: Error resolving offline media URL", error as Error, {
          courseType,
          mediaUrl,
        });
        setUrl(mediaUrl);
      });
  }, [courseType, mediaUrl]);

  // Очищаем blob URLs при размонтировании
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        revokeBlobUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      for (const segmentBlobUrl of segmentBlobUrlsRef.current) {
        revokeBlobUrl(segmentBlobUrl);
      }
      segmentBlobUrlsRef.current = [];
    };
  }, []);

  return url;
}

/**
 * Синхронная версия для получения URL медиафайла
 * Используется когда нужно получить URL сразу, без асинхронной загрузки
 */
export function getOfflineMediaUrlSync(
  courseType: string | null,
  mediaUrl: string | null | undefined,
  offlineCourse: {
    mediaFiles: {
      hlsVideos: Record<string, { manifest: string; segments: Record<string, Blob>; videoId: string }>;
      images: Record<string, Blob>;
      pdfs: Record<string, Blob>;
    };
  } | null,
): string | null {
  if (!mediaUrl || !courseType || !offlineCourse) {
    return mediaUrl || null;
  }

  // Проверяем HLS видео
  const hlsVideo = offlineCourse.mediaFiles.hlsVideos[mediaUrl];
  if (hlsVideo) {
    const result = createOfflineHLSManifest(hlsVideo.manifest, hlsVideo.segments);
    return result.manifestBlobUrl;
  }

  // Проверяем изображения
  if (offlineCourse.mediaFiles.images[mediaUrl]) {
    return URL.createObjectURL(offlineCourse.mediaFiles.images[mediaUrl]);
  }

  // Проверяем PDF
  if (offlineCourse.mediaFiles.pdfs[mediaUrl]) {
    return URL.createObjectURL(offlineCourse.mediaFiles.pdfs[mediaUrl]);
  }

  // Если файл не найден, возвращаем оригинальный URL
  return mediaUrl;
}
