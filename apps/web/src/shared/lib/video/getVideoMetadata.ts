"use server";

import { prisma } from "@gafus/prisma";
import { getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import type { TranscodingStatus } from "@gafus/prisma";

export interface VideoMetadata {
  thumbnailPath: string | null;
  videoId: string | null;
  transcodingStatus: TranscodingStatus | null;
  isExternal: boolean;
}

/**
 * Получает метаданные видео по videoUrl
 * - Для CDN видео: ищет TrainerVideo и возвращает thumbnailPath, videoId, transcodingStatus
 * - Для внешних видео (YouTube, VK): возвращает isExternal: true
 */
export async function getVideoMetadata(
  videoUrl: string | null | undefined,
): Promise<VideoMetadata> {
  if (!videoUrl) {
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: false,
    };
  }

  // Внешние видео (YouTube, VK, RuTube) - возвращаем как есть
  const externalPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /rutube\.ru/,
    /vimeo\.com/,
    /vk\.com\/video/,
    /vkvideo\.ru/,
  ];

  if (externalPatterns.some((pattern) => pattern.test(videoUrl))) {
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: true,
    };
  }

  // Проверяем, является ли это CDN видео
  const isCDNVideo =
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media");

  const isHLS = videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8");

  // Если это CDN видео, пытаемся найти TrainerVideo
  if (isCDNVideo) {
    // Извлекаем относительный путь из CDN URL
    const relativePath = getRelativePathFromCDNUrl(videoUrl);

    try {
      // Вариант 1: Ищем по hlsManifestPath (если videoUrl уже указывает на .m3u8)
      if (isHLS) {
        const hlsManifestPath = relativePath.startsWith("uploads/")
          ? relativePath.replace("uploads/", "")
          : relativePath;

        const videoByHls = await prisma.trainerVideo.findFirst({
          where: {
            hlsManifestPath,
          },
          select: {
            id: true,
            thumbnailPath: true,
            transcodingStatus: true,
          },
        });

        if (videoByHls) {
          return {
            thumbnailPath: videoByHls.thumbnailPath,
            videoId: videoByHls.id,
            transcodingStatus: videoByHls.transcodingStatus,
            isExternal: false,
          };
        }
      }

      // Вариант 2: Ищем по relativePath
      const videoByPath = await prisma.trainerVideo.findFirst({
        where: {
          relativePath,
        },
        select: {
          id: true,
          thumbnailPath: true,
          transcodingStatus: true,
        },
      });

      if (videoByPath) {
        return {
          thumbnailPath: videoByPath.thumbnailPath,
          videoId: videoByPath.id,
          transcodingStatus: videoByPath.transcodingStatus,
          isExternal: false,
        };
      }
    } catch (error) {
      console.error("[getVideoMetadata] Ошибка при поиске видео:", error);
    }
  }

  // Видео не найдено или не CDN
  return {
    thumbnailPath: null,
    videoId: null,
    transcodingStatus: null,
    isExternal: false,
  };
}
