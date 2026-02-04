"use server";

import { extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";
import type { TranscodingStatus } from "@gafus/prisma";

export interface VideoMetadata {
  thumbnailPath: string | null;
  videoId: string | null;
  transcodingStatus: TranscodingStatus | null;
  isExternal: boolean;
}

/**
 * Получает метаданные видео по videoUrl.
 * Для CDN: извлекает videoId из пути (videocourses/{videoId}/...) и ищет по id.
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

  const isCDNVideo =
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media");

  if (!isCDNVideo) {
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: false,
    };
  }

  const videoId = extractVideoIdFromCdnUrl(videoUrl);
  if (!videoId) {
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: false,
    };
  }

  try {
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: { id: true, thumbnailPath: true, transcodingStatus: true },
    });

    if (!video) {
      return {
        thumbnailPath: null,
        videoId: null,
        transcodingStatus: null,
        isExternal: false,
      };
    }

    return {
      thumbnailPath: video.thumbnailPath,
      videoId: video.id,
      transcodingStatus: video.transcodingStatus,
      isExternal: false,
    };
  } catch (error) {
    console.error("[getVideoMetadata] Ошибка при поиске видео:", error);
    return {
      thumbnailPath: null,
      videoId: null,
      transcodingStatus: null,
      isExternal: false,
    };
  }
}
