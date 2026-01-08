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
 * Получает медиафайл из офлайн-хранилища по URL
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
      logger.warn("getOfflineMediaBlob: Offline course not found", {
        courseType,
        mediaUrl,
      });
      return null;
    }

    const imageKeys = Object.keys(offlineCourse.mediaFiles.images);
    logger.info("getOfflineMediaBlob: Course found, checking media files", {
      courseType,
      mediaUrl,
      totalVideos: Object.keys(offlineCourse.mediaFiles.videos).length,
      totalImages: imageKeys.length,
      totalPdfs: Object.keys(offlineCourse.mediaFiles.pdfs).length,
      imageKeys: imageKeys.slice(0, 5), // Первые 5 для логов
    });

    // Проверяем видео
    if (offlineCourse.mediaFiles.videos[mediaUrl]) {
      logger.info("getOfflineMediaBlob: Found in videos", {
        courseType,
        mediaUrl,
        blobSize: offlineCourse.mediaFiles.videos[mediaUrl].size,
      });
      return offlineCourse.mediaFiles.videos[mediaUrl];
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

    const availableImageKeys = Object.keys(offlineCourse.mediaFiles.images);
    logger.warn("getOfflineMediaBlob: Media file not found in IndexedDB", {
      courseType,
      mediaUrl,
      availableImageKeys: availableImageKeys.slice(0, 10),
      exactMatch: offlineCourse.mediaFiles.images[mediaUrl] !== undefined,
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

  useEffect(() => {
    logger.info("useOfflineMediaUrl: Effect triggered", {
      courseType,
      mediaUrl,
      currentUrl: url,
      hasBlobUrl: !!blobUrlRef.current,
    });

    // Очищаем предыдущий blob URL если есть
    if (blobUrlRef.current) {
      logger.info("useOfflineMediaUrl: Revoking previous blob URL", {
        courseType,
        mediaUrl,
        previousBlobUrl: blobUrlRef.current,
      });
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
    }

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

    // Пытаемся получить файл из офлайн-хранилища
    getOfflineMediaBlob(courseType, mediaUrl)
      .then((blob) => {
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
          logger.warn("useOfflineMediaUrl: Blob not found, using original URL", {
            courseType,
            mediaUrl,
          });
          setUrl(mediaUrl);
        }
      })
      .catch((error) => {
        logger.error("useOfflineMediaUrl: Error resolving offline media URL", error as Error, {
          courseType,
          mediaUrl,
        });
        setUrl(mediaUrl);
      });
  }, [courseType, mediaUrl]);

  // Очищаем blob URL при размонтировании
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        revokeBlobUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
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
  offlineCourse: { mediaFiles: { videos: Record<string, Blob>; images: Record<string, Blob>; pdfs: Record<string, Blob> } } | null,
): string | null {
  if (!mediaUrl || !courseType || !offlineCourse) {
    return mediaUrl || null;
  }

  // Проверяем видео
  if (offlineCourse.mediaFiles.videos[mediaUrl]) {
    return URL.createObjectURL(offlineCourse.mediaFiles.videos[mediaUrl]);
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
