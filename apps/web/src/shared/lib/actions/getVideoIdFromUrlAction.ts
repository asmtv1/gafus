"use server";

import { getVideoIdAndPathsFromUrl } from "@gafus/core/services/trainerVideo";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-get-video-id-from-url");

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
    const result = await getVideoIdAndPathsFromUrl(videoUrl);
    if (result.success && result.videoId) {
      logger.info("Найдено видео по videoId", {
        videoId: result.videoId,
        hlsManifestPath: result.hlsManifestPath,
      });
    }
    return result;
  } catch (error) {
    logger.error("Ошибка в getVideoIdFromUrlAction", error as Error, { videoUrl });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}
