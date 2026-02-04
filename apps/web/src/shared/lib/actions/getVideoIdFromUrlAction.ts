"use server";

import { extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-get-video-id-from-url");

/**
 * Получает videoId, hlsManifestPath и thumbnailPath из videoUrl для скачивания HLS видео.
 * Извлекает videoId из пути CDN (videocourses/{videoId}/...) и ищет запись по id.
 */
export async function getVideoIdFromUrlAction(
  videoUrl: string,
): Promise<{
  success: boolean;
  videoId?: string;
  hlsManifestPath?: string;
  thumbnailPath?: string;
  error?: string;
}> {
  try {
    if (!videoUrl) {
      return { success: false, error: "videoUrl не предоставлен" };
    }

    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (!isCDNVideo) {
      return { success: false, error: "URL не является CDN видео" };
    }

    const videoId = extractVideoIdFromCdnUrl(videoUrl);
    if (!videoId) {
      return { success: false, error: "Не удалось извлечь videoId из URL" };
    }

    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        transcodingStatus: true,
        hlsManifestPath: true,
        thumbnailPath: true,
      },
    });

    if (!video) {
      logger.warn("Видео не найдено в БД", { videoId });
      return { success: false, error: "Видео не найдено" };
    }

    if (video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      logger.warn("Видео ещё не транскодировано", {
        videoId,
        transcodingStatus: video.transcodingStatus,
      });
      return { success: false, error: "Видео ещё обрабатывается" };
    }

    logger.info("Найдено видео по videoId", {
      videoId,
      hlsManifestPath: video.hlsManifestPath,
    });

    return {
      success: true,
      videoId,
      hlsManifestPath: video.hlsManifestPath,
      thumbnailPath: video.thumbnailPath ?? undefined,
    };
  } catch (error) {
    logger.error("Ошибка в getVideoIdFromUrlAction", error as Error, { videoUrl });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}
