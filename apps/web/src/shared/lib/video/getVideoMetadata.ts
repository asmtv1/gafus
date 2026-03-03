"use server";

import { getVideoMetadataByUrl, type VideoMetadata } from "@gafus/core/services/trainerVideo";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-get-video-metadata");

export type { VideoMetadata };

export async function getVideoMetadata(
  videoUrl: string | null | undefined,
): Promise<VideoMetadata> {
  try {
    return await getVideoMetadataByUrl(videoUrl);
  } catch (error) {
    logger.error("Ошибка при поиске видео", error as Error);
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: false,
    };
  }
}
