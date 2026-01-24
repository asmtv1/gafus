"use client";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-download-hls-video");

/**
 * Преобразует CDN URL в прокси URL для скачивания
 */
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

/**
 * Убеждается, что путь начинается с префикса uploads/
 * hlsManifestPath в БД хранится без этого префикса, но файлы в CDN находятся с ним
 */
function ensureUploadsPrefix(path: string): string {
  if (path.startsWith("uploads/")) {
    return path;
  }
  return `uploads/${path}`;
}

/**
 * Скачивает файл с retry логикой
 */
async function downloadWithRetry(
  url: string,
  maxRetries: number = 5,
  retryDelay: number = 1000,
): Promise<Blob | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(getCdnProxyUrl(url), {
        headers: {
          "X-Gafus-Background-Download": "1",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      if (attempt > 1) {
        logger.info(`Файл скачан с попытки ${attempt}`, { url });
      }
      return blob;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Попытка ${attempt}/${maxRetries} не удалась`, {
        url,
        attempt,
        error: lastError.message,
      });

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error("Все попытки скачивания исчерпаны", lastError as Error, { url, maxRetries });
  return null;
}

/**
 * Извлекает имя файла из пути
 */
function getFileNameFromPath(path: string): string {
  // Убираем ведущие слеши и пути
  const normalized = path
    .trim()
    .replace(/^\/+/, "")
    .replace(/^\.\.\//, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

/**
 * Формирует полный путь к сегменту на основе пути к манифесту
 * @param hlsManifestPath - Путь к манифесту (может быть с или без префикса uploads/)
 * @param segmentFileName - Имя файла сегмента
 * @returns Полный путь к сегменту с префиксом uploads/
 */
function getSegmentPath(hlsManifestPath: string, segmentFileName: string): string {
  // Манифест находится в hls/playlist.m3u8, сегменты в той же папке hls/
  // Например: trainers/123/videocourses/456/hls/playlist.m3u8 -> uploads/trainers/123/videocourses/456/hls/segment-000.ts
  // Убираем имя файла манифеста, оставляем только директорию
  const manifestDir = hlsManifestPath.substring(0, hlsManifestPath.lastIndexOf("/"));
  const segmentPath = `${manifestDir}/${segmentFileName}`;
  // Убеждаемся, что путь начинается с uploads/
  return ensureUploadsPrefix(segmentPath);
}

/**
 * Скачивает HLS видео (манифест + все сегменты)
 * @param hlsManifestPath - Путь к манифесту в CDN (например, trainers/123/videocourses/456/hls/playlist.m3u8)
 * @param videoUrl - Оригинальный URL видео (для ключа в IndexedDB)
 * @param onProgress - Callback для обновления прогресса (current, total)
 * @returns Объект с манифестом, сегментами, версией и timestamp или null при ошибке
 */
export async function downloadHLSVideo(
  hlsManifestPath: string,
  videoUrl: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{
  manifest: string;
  segments: Record<string, Blob>;
  videoId: string;
  version: string;
  downloadedAt: number;
} | null> {
  try {
    logger.info("Начинаем скачивание HLS видео", { hlsManifestPath, videoUrl });

    // Формируем CDN URL для манифеста
    // hlsManifestPath в БД хранится без префикса uploads/, но файлы в CDN находятся с ним
    // Используем правильный формат: https://storage.yandexcloud.net/gafus-media/uploads/...
    const manifestPathWithUploads = ensureUploadsPrefix(hlsManifestPath);
    const manifestCdnUrl = `https://storage.yandexcloud.net/gafus-media/${manifestPathWithUploads}`;
    const proxyUrl = getCdnProxyUrl(manifestCdnUrl);
    logger.info("Скачиваем манифест", {
      originalPath: hlsManifestPath,
      pathWithUploads: manifestPathWithUploads,
      cdnUrl: manifestCdnUrl,
      proxyUrl,
    });

    // Скачиваем манифест
    const manifestBlob = await downloadWithRetry(manifestCdnUrl);
    if (!manifestBlob) {
      logger.error("Не удалось скачать манифест", new Error("Manifest download failed"), {
        manifestCdnUrl,
      });
      return null;
    }

    // Читаем манифест как текст
    const manifestText = await manifestBlob.text();
    logger.info("Манифест скачан", {
      size: manifestBlob.size,
      lines: manifestText.split("\n").length,
    });

    // Парсим манифест и извлекаем пути к сегментам
    const lines = manifestText.split("\n");
    const segmentPaths: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Пропускаем комментарии и пустые строки
      if (trimmed && !trimmed.startsWith("#")) {
        segmentPaths.push(trimmed);
      }
    }

    logger.info("Найдено сегментов в манифесте", {
      count: segmentPaths.length,
      firstFew: segmentPaths.slice(0, 3),
    });

    if (segmentPaths.length === 0) {
      logger.error("Манифест не содержит сегментов", new Error("No segments found"), {
        manifestText: manifestText.substring(0, 200),
      });
      return null;
    }

    // Скачиваем все сегменты
    const segments: Record<string, Blob> = {};
    const totalFiles = 1 + segmentPaths.length; // манифест + сегменты
    let downloadedFiles = 1; // манифест уже скачан

    if (onProgress) {
      onProgress(downloadedFiles, totalFiles);
    }

    // Скачиваем сегменты параллельно с ограничением concurrency
    const concurrency = 5; // Максимум 5 параллельных загрузок
    const segmentQueue = [...segmentPaths];
    const downloadPromises: Promise<void>[] = [];

    while (segmentQueue.length > 0 || downloadPromises.length > 0) {
      // Запускаем новые загрузки до лимита concurrency
      while (downloadPromises.length < concurrency && segmentQueue.length > 0) {
        const segmentPath = segmentQueue.shift()!;
        const segmentFileName = getFileNameFromPath(segmentPath);
        // getSegmentPath уже добавляет префикс uploads/ и формирует полный путь
        const fullSegmentPath = getSegmentPath(hlsManifestPath, segmentFileName);
        // Используем правильный формат: https://storage.yandexcloud.net/gafus-media/uploads/...
        const segmentCdnUrl = `https://storage.yandexcloud.net/gafus-media/${fullSegmentPath}`;
        const segmentProxyUrl = getCdnProxyUrl(segmentCdnUrl);
        logger.info("Скачиваем сегмент", {
          segmentFileName,
          fullSegmentPath,
          cdnUrl: segmentCdnUrl,
          proxyUrl: segmentProxyUrl,
        });

        const downloadPromise = downloadWithRetry(segmentCdnUrl)
          .then((blob) => {
            if (!blob) {
              throw new Error(`Не удалось скачать сегмент: ${segmentFileName}`);
            }
            segments[segmentFileName] = blob;
            downloadedFiles++;
            if (onProgress) {
              onProgress(downloadedFiles, totalFiles);
            }
            logger.info("Сегмент скачан", {
              segmentFileName,
              size: blob.size,
              progress: `${downloadedFiles}/${totalFiles}`,
            });
          })
          .catch((error) => {
            logger.error("Ошибка при скачивании сегмента", error as Error, {
              segmentFileName,
              segmentCdnUrl,
            });
            throw error; // Пробрасываем ошибку дальше
          })
          .finally(() => {
            // Удаляем промис из массива после завершения
            const index = downloadPromises.indexOf(downloadPromise);
            if (index > -1) {
              downloadPromises.splice(index, 1);
            }
          });

        downloadPromises.push(downloadPromise);
      }

      // Ждём завершения хотя бы одной загрузки
      if (downloadPromises.length > 0) {
        await Promise.race(downloadPromises);
      }
    }

    // Проверяем, что все сегменты скачаны
    const expectedSegments = segmentPaths.map((path) => getFileNameFromPath(path));
    const downloadedSegmentNames = Object.keys(segments);

    for (const expectedSegment of expectedSegments) {
      if (!downloadedSegmentNames.includes(expectedSegment)) {
        logger.error("Не все сегменты скачаны", new Error("Missing segments"), {
          expectedSegment,
          downloadedSegments: downloadedSegmentNames,
        });
        return null;
      }
    }

    logger.info("Все сегменты успешно скачаны", {
      totalSegments: downloadedSegmentNames.length,
      totalSize: Object.values(segments).reduce((sum, blob) => sum + blob.size, 0),
    });

    // Модифицируем манифест: заменяем пути на относительные (только имя файла)
    const modifiedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        // Заменяем путь на только имя файла
        return getFileNameFromPath(trimmed);
      }
      return line;
    });

    const modifiedManifest = modifiedLines.join("\n");

    // Извлекаем videoId из hlsManifestPath для сохранения
    // Формат: trainers/{trainerId}/videocourses/{videoId}/hls/playlist.m3u8
    const pathParts = hlsManifestPath.split("/");
    const videoIdIndex = pathParts.indexOf("videocourses");
    const videoId =
      videoIdIndex >= 0 && videoIdIndex < pathParts.length - 1
        ? pathParts[videoIdIndex + 1]
        : "unknown";

    // Получаем версию из манифеста (hash или timestamp)
    // Используем hash манифеста как версию для надежности
    const manifestHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(modifiedManifest))
      .then((buffer) =>
        Array.from(new Uint8Array(buffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .substring(0, 16),
      ); // Первые 16 символов хэша

    return {
      manifest: modifiedManifest,
      segments,
      videoId,
      version: manifestHash,
      downloadedAt: Date.now(),
    };
  } catch (error) {
    logger.error("Критическая ошибка при скачивании HLS видео", error as Error, {
      hlsManifestPath,
      videoUrl,
    });
    return null;
  }
}
