"use server";

import { prisma, TranscodingStatus } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

type VideoStatusResult = {
  id: string;
  transcodingStatus: TranscodingStatus;
  transcodingError: string | null;
  hlsManifestPath: string | null;
  thumbnailPath: string | null;
  durationSec: number | null;
};

/**
 * Получает статусы транскодирования для нескольких видео одним запросом
 * @param videoIds - Массив ID видео для проверки
 * @returns Массив статусов видео или объект с ошибкой
 */
export async function getMultipleVideoStatuses(
  videoIds: string[]
): Promise<VideoStatusResult[] | { error: string }> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }

  if (videoIds.length === 0) {
    return [];
  }

  const videos = await prisma.trainerVideo.findMany({
    where: {
      id: { in: videoIds },
    },
    select: {
      id: true,
      transcodingStatus: true,
      transcodingError: true,
      hlsManifestPath: true,
      thumbnailPath: true,
      durationSec: true,
    },
  });

  return videos;
}
