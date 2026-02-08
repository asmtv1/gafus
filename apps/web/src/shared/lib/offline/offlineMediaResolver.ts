"use client";

import { useState, useEffect, useRef } from "react";
import { createWebLogger } from "@gafus/logger";
import { getOfflineCourseByType } from "./offlineCourseStorage";
import { useOfflineStore } from "@shared/stores/offlineStore";

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
function _getFileNameFromPath(path: string): string {
  const normalized = path
    .trim()
    .replace(/^\/+/, "")
    .replace(/^\.\.\//, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

/**
 * Извлекает videoId из различных форматов URL
 * @param url - URL видео
 * @returns videoId или null если не удалось извлечь
 */
function extractVideoIdFromUrl(url: string): string | null {
  try {
    // Формат: /api/video/{videoId}/manifest
    const apiMatch = url.match(/\/api\/video\/([^/]+)\//);
    if (apiMatch) {
      return apiMatch[1];
    }

    // Формат: trainers/{trainerId}/videocourses/{videoId}/...
    const videocoursesMatch = url.match(/videocourses\/([^/]+)/);
    if (videocoursesMatch) {
      return videocoursesMatch[1];
    }

    // Старый формат: trainer-videos/{trainerId}/{videoId}.mp4
    // Или новый формат с videoId в пути
    const pathParts = url.split("/");
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      // Ищем часть, которая выглядит как videoId (cuid формат)
      if (part && part.length > 10 && /^[a-z0-9]+$/.test(part)) {
        // Проверяем, что следующая часть - это файл или hls
        const nextPart = pathParts[i + 1];
        if (nextPart === "hls" || nextPart?.endsWith(".mp4") || nextPart?.endsWith(".m3u8")) {
          return part;
        }
      }
    }

    return null;
  } catch (error) {
    logger.warn("Failed to extract videoId from URL", { url, error });
    return null;
  }
}

/**
 * Нормализует URL видео для поиска в IndexedDB
 * Преобразует различные форматы URL в единый формат для поиска
 * @param url - URL видео
 * @returns Нормализованный URL или исходный URL если не удалось нормализовать
 */
function normalizeVideoUrl(url: string): string {
  try {
    let normalized = url;

    // Убираем query параметры и hash, если это полный URL
    try {
      const urlObj = new URL(normalized);
      normalized = urlObj.origin + urlObj.pathname;
    } catch {
      // Если не удалось создать URL объект (относительный путь), работаем со строкой
      // Убираем query параметры вручную
      const queryIndex = normalized.indexOf("?");
      if (queryIndex !== -1) {
        normalized = normalized.substring(0, queryIndex);
      }
      const hashIndex = normalized.indexOf("#");
      if (hashIndex !== -1) {
        normalized = normalized.substring(0, hashIndex);
      }
    }

    // Убираем домен, оставляем только путь
    if (normalized.includes("storage.yandexcloud.net/gafus-media/")) {
      normalized = normalized.split("storage.yandexcloud.net/gafus-media/")[1] || normalized;
    } else if (normalized.includes("gafus-media.storage.yandexcloud.net/")) {
      normalized = normalized.split("gafus-media.storage.yandexcloud.net/")[1] || normalized;
    }

    // Убираем префикс uploads/ если есть
    if (normalized.startsWith("uploads/")) {
      normalized = normalized.replace("uploads/", "");
    }

    // Заменяем /original.mp4 на /hls/playlist.m3u8 (старый формат на новый)
    if (normalized.endsWith("/original.mp4") || normalized.endsWith("original.mp4")) {
      normalized = normalized.replace(/\/original\.mp4$/, "/hls/playlist.m3u8");
      normalized = normalized.replace(/original\.mp4$/, "/hls/playlist.m3u8");
    }

    // Заменяем .mp4 на /hls/playlist.m3u8 если это файл в папке videocourses
    if (normalized.includes("/videocourses/") && normalized.endsWith(".mp4")) {
      normalized = normalized.replace(/\.mp4$/, "/hls/playlist.m3u8");
    }

    // Для API URL поиск будет по videoId, возвращаем исходный URL
    if (normalized.includes("/api/video/")) {
      return url; // Возвращаем исходный URL, поиск будет по videoId
    }

    return normalized;
  } catch (error) {
    logger.warn("Failed to normalize video URL", { url, error });
    return url;
  }
}

/**
 * Получает HLS манифест URL из офлайн-хранилища
 * @param courseType - Тип курса
 * @param mediaUrl - URL видео
 * @returns Service Worker URL для манифеста и videoId или null если не найдено
 */
async function getOfflineHLSManifestUrl(
  courseType: string,
  mediaUrl: string,
): Promise<{ manifestUrl: string; videoId: string } | null> {
  try {
    logger.info("getOfflineHLSManifestUrl: Starting search", {
      courseType,
      mediaUrl,
    });

    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      logger.warn("getOfflineHLSManifestUrl: Course not found in IndexedDB", {
        courseType,
        mediaUrl,
      });
      return null;
    }

    const hlsVideos = offlineCourse.mediaFiles.hlsVideos;
    let hlsVideo = hlsVideos[mediaUrl];

    // Шаг 1: Поиск по точному совпадению
    if (hlsVideo) {
      logger.info("getOfflineHLSManifestUrl: Found by exact match", {
        courseType,
        mediaUrl,
        segmentsCount: Object.keys(hlsVideo.segments).length,
      });
    } else {
      // Шаг 2: Поиск по нормализованному URL
      const normalizedUrl = normalizeVideoUrl(mediaUrl);
      logger.info("getOfflineHLSManifestUrl: Trying normalized URL", {
        courseType,
        originalUrl: mediaUrl,
        normalizedUrl,
      });

      // Пробуем найти по нормализованному URL
      for (const [key, value] of Object.entries(hlsVideos)) {
        const normalizedKey = normalizeVideoUrl(key);
        if (normalizedKey === normalizedUrl || key === normalizedUrl) {
          hlsVideo = value;
          logger.info("getOfflineHLSManifestUrl: Found by normalized URL", {
            courseType,
            originalUrl: mediaUrl,
            normalizedUrl,
            matchedKey: key,
            segmentsCount: Object.keys(hlsVideo.segments).length,
          });
          break;
        }
      }

      // Шаг 3: Поиск по videoId
      if (!hlsVideo) {
        const videoId = extractVideoIdFromUrl(mediaUrl);
        if (videoId) {
          logger.info("getOfflineHLSManifestUrl: Trying search by videoId", {
            courseType,
            mediaUrl,
            videoId,
          });

          for (const [key, value] of Object.entries(hlsVideos)) {
            if (value.videoId === videoId) {
              hlsVideo = value;
              logger.info("getOfflineHLSManifestUrl: Found by videoId", {
                courseType,
                mediaUrl,
                videoId,
                matchedKey: key,
                segmentsCount: Object.keys(hlsVideo.segments).length,
              });
              break;
            }
          }
        }
      }

      // Шаг 4: Если всё ещё не найдено, логируем все доступные ключи для диагностики
      if (!hlsVideo) {
        const availableKeys = Object.keys(hlsVideos);
        const availableVideoIds = Object.values(hlsVideos).map((v) => v.videoId);
        const extractedVideoId = extractVideoIdFromUrl(mediaUrl);
        const normalizedUrlForLog = normalizeVideoUrl(mediaUrl);

        logger.warn("getOfflineHLSManifestUrl: HLS video not found after all search attempts", {
          courseType,
          mediaUrl,
          normalizedUrl: normalizedUrlForLog,
          extractedVideoId,
          availableKeysCount: availableKeys.length,
          availableKeys: availableKeys.slice(0, 5), // Первые 5 для логов
          availableVideoIds: availableVideoIds.slice(0, 5),
        });
        return null;
      }
    }

    // Возвращаем Service Worker URL вместо blob URL
    const manifestUrl = `/offline-hls/${courseType}/${hlsVideo.videoId}/manifest.m3u8`;

    logger.info("getOfflineHLSManifestUrl: HLS manifest Service Worker URL created", {
      courseType,
      mediaUrl,
      videoId: hlsVideo.videoId,
      manifestUrl,
    });

    return {
      manifestUrl,
      videoId: hlsVideo.videoId,
    };
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
async function getOfflineMediaBlob(courseType: string, mediaUrl: string): Promise<Blob | null> {
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
 * - При онлайн-статусе: возвращает оригинальный URL (интернет-версия)
 * - При офлайн-статусе: проверяет IndexedDB и возвращает blob URL если файл скачан, иначе оригинальный URL
 */
export function useOfflineMediaUrl(
  courseType: string | null,
  mediaUrl: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(mediaUrl || null);
  // Blob URL ref только для изображений и PDF (не для HLS видео)
  // HLS видео используют Service Worker URLs, которые не требуют очистки
  const blobUrlRef = useRef<string | null>(null);
  // Реактивная подписка на изменения онлайн-статуса
  const isOnline = useOfflineStore((state) => state.isOnline);

  useEffect(() => {
    logger.info("useOfflineMediaUrl: Effect triggered", {
      courseType,
      mediaUrl,
      currentUrl: url,
      hasBlobUrl: !!blobUrlRef.current,
      isOnline,
    });

    // Очищаем предыдущие blob URLs если есть (только для изображений и PDF, не для HLS)
    // HLS видео используют Service Worker URLs, которые не требуют очистки
    if (blobUrlRef.current && blobUrlRef.current.startsWith("blob:")) {
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

    // Если пользователь онлайн, используем интернет-версию (актуальную)
    if (isOnline) {
      logger.info("useOfflineMediaUrl: Online status, using internet version", {
        courseType,
        mediaUrl,
      });
      setUrl(mediaUrl);
      return;
    }

    logger.info("useOfflineMediaUrl: Offline status, starting blob search", {
      courseType,
      mediaUrl,
    });

    // Сначала проверяем, является ли это HLS видео
    getOfflineHLSManifestUrl(courseType, mediaUrl)
      .then((hlsResult) => {
        if (hlsResult) {
          // Service Worker URLs не требуют очистки (не blob URLs)
          // Очищаем blob URL ref так как для HLS видео он не используется
          if (blobUrlRef.current) {
            revokeBlobUrl(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          logger.info("useOfflineMediaUrl: HLS манифест найден, используем Service Worker URL", {
            courseType,
            mediaUrl,
            manifestUrl: hlsResult.manifestUrl,
            videoId: hlsResult.videoId,
          });
          setUrl(hlsResult.manifestUrl);
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
  }, [courseType, mediaUrl, isOnline]);

  // Очищаем blob URLs при размонтировании (только для изображений и PDF, не для HLS)
  // HLS видео используют Service Worker URLs, которые не требуют очистки
  useEffect(() => {
    return () => {
      // Очищаем только если это blob URL (не Service Worker URL)
      if (blobUrlRef.current && blobUrlRef.current.startsWith("blob:")) {
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
  offlineCourse: {
    mediaFiles: {
      hlsVideos: Record<
        string,
        { manifest: string; segments: Record<string, Blob>; videoId: string }
      >;
      images: Record<string, Blob>;
      pdfs: Record<string, Blob>;
    };
  } | null,
): string | null {
  if (!mediaUrl || !courseType || !offlineCourse) {
    return mediaUrl || null;
  }

  // Проверяем HLS видео - возвращаем Service Worker URL
  const hlsVideo = offlineCourse.mediaFiles.hlsVideos[mediaUrl];
  if (hlsVideo) {
    return `/offline-hls/${courseType}/${hlsVideo.videoId}/manifest.m3u8`;
  }

  // Если не найдено по точному совпадению, ищем по videoId
  const videoId = extractVideoIdFromUrl(mediaUrl);
  if (videoId) {
    for (const [, video] of Object.entries(offlineCourse.mediaFiles.hlsVideos)) {
      if (video.videoId === videoId) {
        return `/offline-hls/${courseType}/${video.videoId}/manifest.m3u8`;
      }
    }
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
