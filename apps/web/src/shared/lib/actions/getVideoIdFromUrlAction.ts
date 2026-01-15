"use server";

import { prisma } from "@gafus/prisma";
import { getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-get-video-id-from-url");

/**
 * Получает videoId, hlsManifestPath и thumbnailPath из videoUrl для скачивания HLS видео
 * @param videoUrl - URL видео из CDN
 * @returns Объект с videoId, hlsManifestPath и thumbnailPath или ошибкой
 */
export async function getVideoIdFromUrlAction(
  videoUrl: string
): Promise<{ success: boolean; videoId?: string; hlsManifestPath?: string; thumbnailPath?: string; error?: string }> {
  try {
    if (!videoUrl) {
      return { success: false, error: "videoUrl не предоставлен" };
    }

    // Проверяем, является ли это CDN видео
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (!isCDNVideo) {
      return { success: false, error: "URL не является CDN видео" };
    }

    // Извлекаем относительный путь из CDN URL
    const relativePath = getRelativePathFromCDNUrl(videoUrl);
    logger.info("Извлекаем relativePath из videoUrl", { videoUrl, relativePath });

    // Проверяем, является ли это HLS манифест
    const isHLS = videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8");

    try {
      // Вариант 1: Ищем по hlsManifestPath (если videoUrl уже указывает на .m3u8)
      if (isHLS) {
        const hlsManifestPath = relativePath.startsWith("uploads/")
          ? relativePath.replace("uploads/", "")
          : relativePath;

        const videoByHls = await prisma.trainerVideo.findFirst({
          where: {
            hlsManifestPath,
            transcodingStatus: "COMPLETED",
          },
          select: {
            id: true,
            hlsManifestPath: true,
            thumbnailPath: true,
          },
        });

        if (videoByHls && videoByHls.hlsManifestPath) {
          logger.info("Найдено видео по hlsManifestPath", {
            videoId: videoByHls.id,
            hlsManifestPath: videoByHls.hlsManifestPath,
            thumbnailPath: videoByHls.thumbnailPath,
          });
          return {
            success: true,
            videoId: videoByHls.id,
            hlsManifestPath: videoByHls.hlsManifestPath,
            thumbnailPath: videoByHls.thumbnailPath || undefined,
          };
        }
      }

      // Вариант 2: Ищем по relativePath (videoUrl в Step может указывать на старый путь)
      // После транскодирования файлы удалены, но relativePath остался
      const videoByPath = await prisma.trainerVideo.findFirst({
        where: {
          relativePath,
        },
        select: {
          id: true,
          transcodingStatus: true,
          hlsManifestPath: true,
          thumbnailPath: true,
        },
      });

      if (videoByPath) {
        // Если видео транскодировано, возвращаем hlsManifestPath
        if (videoByPath.transcodingStatus === "COMPLETED" && videoByPath.hlsManifestPath) {
          logger.info("Найдено видео по relativePath", {
            videoId: videoByPath.id,
            hlsManifestPath: videoByPath.hlsManifestPath,
            thumbnailPath: videoByPath.thumbnailPath,
          });
          return {
            success: true,
            videoId: videoByPath.id,
            hlsManifestPath: videoByPath.hlsManifestPath,
            thumbnailPath: videoByPath.thumbnailPath || undefined,
          };
        }

        // Если видео ещё не транскодировано
        logger.warn("Видео найдено, но ещё не транскодировано", {
          videoId: videoByPath.id,
          transcodingStatus: videoByPath.transcodingStatus,
        });
        return {
          success: false,
          error: "Видео ещё обрабатывается",
        };
      }

      logger.warn("Видео не найдено в БД", { relativePath });
      return { success: false, error: "Видео не найдено" };
    } catch (error) {
      logger.error("Ошибка при поиске видео в БД", error as Error, { relativePath });
      return { success: false, error: "Ошибка при поиске видео" };
    }
  } catch (error) {
    logger.error("Ошибка в getVideoIdFromUrlAction", error as Error, { videoUrl });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}
