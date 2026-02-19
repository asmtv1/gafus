/**
 * Хелперы для работы с видео тренеров.
 */

import { prisma } from "@gafus/prisma";

/** Информация о видео для потокового воспроизведения (HLS manifest/segment) */
export interface VideoInfoForStreaming {
  hlsManifestPath: string | null;
  transcodingStatus: string;
}

/**
 * Получает информацию о видео для потокового воспроизведения (HLS manifest/segment)
 */
export async function getVideoInfoForStreaming(
  videoId: string,
): Promise<VideoInfoForStreaming | null> {
  return await prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: {
      hlsManifestPath: true,
      transcodingStatus: true,
    },
  });
}
