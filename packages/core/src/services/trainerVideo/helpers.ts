/**
 * Хелперы для работы с видео тренеров.
 */

import { prisma } from "@gafus/prisma";

/** Информация о видео для потокового воспроизведения (HLS manifest/segment) */
export interface VideoInfoForStreaming {
  hlsManifestPath: string | null;
  transcodingStatus: string;
}

const TRAINER_VIDEO_PRIVILEGED_ROLES = new Set(["ADMIN", "MODERATOR"]);

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

/**
 * Получает информацию о видео для HLS только если запрашивающий может его смотреть.
 * Тренер видит свои видео, администратор и модератор — все видео панели.
 */
export async function getAuthorizedVideoInfoForStreaming(
  videoId: string,
  requesterId: string,
  requesterRole: string,
): Promise<VideoInfoForStreaming | null> {
  const video = await prisma.trainerVideo.findUnique({
    where: { id: videoId },
    select: {
      hlsManifestPath: true,
      transcodingStatus: true,
      trainerId: true,
    },
  });

  if (!video) {
    return null;
  }

  const isPrivileged = TRAINER_VIDEO_PRIVILEGED_ROLES.has(requesterRole);
  if (!isPrivileged && video.trainerId !== requesterId) {
    return null;
  }

  return {
    hlsManifestPath: video.hlsManifestPath,
    transcodingStatus: video.transcodingStatus,
  };
}
