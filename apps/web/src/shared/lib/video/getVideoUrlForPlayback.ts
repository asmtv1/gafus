"use server";

import { prisma } from "@gafus/prisma";
import { getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import { getSignedVideoUrl } from "./getSignedVideoUrl";

/**
 * Преобразует videoUrl в URL для воспроизведения
 * - Для CDN видео: возвращает signed URL для HLS манифеста через API
 * - Для внешних видео (YouTube, VK): возвращает оригинальный URL
 */
export async function getVideoUrlForPlayback(
  videoUrl: string | null | undefined
): Promise<string | null> {
  if (!videoUrl) {
    return null;
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
    return videoUrl;
  }

  // Проверяем, является ли это CDN видео с HLS манифестом
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
            transcodingStatus: "COMPLETED",
          },
          select: {
            id: true,
          },
        });

        if (videoByHls) {
          const signedUrl = await getSignedVideoUrl(videoByHls.id);
          if (signedUrl) {
            return signedUrl;
          }
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
        },
      });

      if (videoByPath) {
        // Если видео транскодировано, используем signed URL для HLS
        if (videoByPath.transcodingStatus === "COMPLETED" && videoByPath.hlsManifestPath) {
          const signedUrl = await getSignedVideoUrl(videoByPath.id);
          if (signedUrl) {
            return signedUrl;
          }
        }
        // Если видео ещё не транскодировано - возвращаем null, так как оригинальные файлы удалены
        return null;
      }
    } catch (error) {
      console.error("[getVideoUrlForPlayback] Ошибка при поиске видео:", error);
    }

    // Если не нашли видео - возвращаем null (оригинальные файлы удалены после транскодирования)
    return null;
  }

  // Для не-CDN видео (не должно попадать сюда, так как внешние видео обработаны выше)
  return null;
}
