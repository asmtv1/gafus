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

    // Создаём модифицированный манифест с blob URLs
    const result = createOfflineHLSManifest(hlsVideo.manifest, hlsVideo.segments);

    logger.info("getOfflineHLSManifestUrl: HLS manifest created with blob URLs", {
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
