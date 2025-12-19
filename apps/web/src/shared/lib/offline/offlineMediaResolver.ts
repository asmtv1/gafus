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
    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      logger.warn("Offline course not found", { courseType, mediaUrl });
      return null;
    }

    // Проверяем видео
    if (offlineCourse.mediaFiles.videos[mediaUrl]) {
      return offlineCourse.mediaFiles.videos[mediaUrl];
    }

    // Проверяем изображения
    if (offlineCourse.mediaFiles.images[mediaUrl]) {
      return offlineCourse.mediaFiles.images[mediaUrl];
    }

    // Проверяем PDF
    if (offlineCourse.mediaFiles.pdfs[mediaUrl]) {
      return offlineCourse.mediaFiles.pdfs[mediaUrl];
    }

    logger.warn("Media file not found in IndexedDB", {
      courseType,
      mediaUrl,
    });

    return null;
  } catch (error) {
    logger.error("Failed to get offline media blob", error as Error, {
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
    // Очищаем предыдущий blob URL если есть
    if (blobUrlRef.current) {
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!mediaUrl || !courseType) {
      setUrl(mediaUrl || null);
      return;
    }

    // Пытаемся получить файл из офлайн-хранилища
    getOfflineMediaBlob(courseType, mediaUrl)
      .then((blob) => {
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          blobUrlRef.current = blobUrl;
          setUrl(blobUrl);
        } else {
          // Если файл не найден в офлайн-хранилище, возвращаем оригинальный URL
          setUrl(mediaUrl);
        }
      })
      .catch((error) => {
        logger.error("Error resolving offline media URL", error as Error, {
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
