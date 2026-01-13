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
  // Используем console.error для гарантированного вывода в логи
  console.error("[getVideoUrlForPlayback] === НАЧАЛО === videoUrl:", videoUrl);
  console.log("[getVideoUrlForPlayback] Начало, videoUrl:", videoUrl);

  if (!videoUrl) {
    console.log("[getVideoUrlForPlayback] videoUrl пустой, возвращаем null");
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
    console.log("[getVideoUrlForPlayback] Внешнее видео, возвращаем как есть");
    return videoUrl;
  }

  // Проверяем, является ли это CDN видео с HLS манифестом
  const isCDNVideo =
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media");

  const isHLS = videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8");

  console.log("[getVideoUrlForPlayback] Проверка:", {
    isCDNVideo,
    isHLS,
    videoUrl,
  });

  // Если это CDN видео, пытаемся найти TrainerVideo
  if (isCDNVideo) {
    // Извлекаем относительный путь из CDN URL
    const relativePath = getRelativePathFromCDNUrl(videoUrl);
    console.log("[getVideoUrlForPlayback] Извлечён relativePath:", relativePath);
    
    try {
      // Вариант 1: Ищем по hlsManifestPath (если videoUrl уже указывает на .m3u8)
      if (isHLS) {
        const hlsManifestPath = relativePath.startsWith("uploads/")
          ? relativePath.replace("uploads/", "")
          : relativePath;

        console.log("[getVideoUrlForPlayback] Ищем по hlsManifestPath:", hlsManifestPath);

        const videoByHls = await prisma.trainerVideo.findFirst({
          where: {
            hlsManifestPath,
            transcodingStatus: "COMPLETED",
          },
          select: {
            id: true,
          },
        });

        console.log("[getVideoUrlForPlayback] Результат поиска по hlsManifestPath:", videoByHls);

        if (videoByHls) {
          console.log("[getVideoUrlForPlayback] Найдено видео по hlsManifestPath, получаем signed URL для videoId:", videoByHls.id);
          const signedUrl = await getSignedVideoUrl(videoByHls.id);
          console.log("[getVideoUrlForPlayback] Получен signed URL:", signedUrl);
          if (signedUrl) {
            return signedUrl;
          } else {
            console.error("[getVideoUrlForPlayback] ОШИБКА: Найдено HLS видео, но signed URL не получен. Возможно, отсутствует VIDEO_ACCESS_SECRET.");
            return null;
          }
        }
      }

      // Вариант 2: Ищем по relativePath (videoUrl в Step может указывать на старый путь)
      // После транскодирования файлы удалены, но relativePath остался
      console.log("[getVideoUrlForPlayback] Ищем по relativePath:", relativePath);

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

      console.log("[getVideoUrlForPlayback] Результат поиска по relativePath:", {
        found: !!videoByPath,
        id: videoByPath?.id,
        transcodingStatus: videoByPath?.transcodingStatus,
        hlsManifestPath: videoByPath?.hlsManifestPath,
      });

      if (videoByPath) {
        // Если видео транскодировано, используем signed URL для HLS
        if (videoByPath.transcodingStatus === "COMPLETED" && videoByPath.hlsManifestPath) {
          console.log("[getVideoUrlForPlayback] Видео транскодировано, получаем signed URL для videoId:", videoByPath.id);
          const signedUrl = await getSignedVideoUrl(videoByPath.id);
          console.log("[getVideoUrlForPlayback] Получен signed URL:", signedUrl);
          if (signedUrl) {
            return signedUrl;
          } else {
            // Если signed URL не получен, но видео транскодировано - оригинальный файл удалён
            // Не возвращаем оригинальный URL, так как он не существует
            console.error("[getVideoUrlForPlayback] ОШИБКА: Видео транскодировано, но signed URL не получен. Возможно, отсутствует VIDEO_ACCESS_SECRET.");
            return null;
          }
        } else {
          console.log("[getVideoUrlForPlayback] Видео не транскодировано или нет hlsManifestPath:", {
            transcodingStatus: videoByPath.transcodingStatus,
            hasHlsManifest: !!videoByPath.hlsManifestPath,
          });
          // Если видео ещё не транскодировано - возвращаем null, так как оригинальные файлы удалены
          console.log("[getVideoUrlForPlayback] Видео не транскодировано, возвращаем null");
          return null;
        }
      } else {
        console.log("[getVideoUrlForPlayback] Видео не найдено по relativePath");
      }
    } catch (error) {
      console.error("[getVideoUrlForPlayback] ОШИБКА при поиске видео:", error);
    }

    // Если не нашли видео - возвращаем null (оригинальные файлы удалены после транскодирования)
    console.log("[getVideoUrlForPlayback] Видео не найдено, возвращаем null");
    return null;
  }

  // Для не-CDN видео (не должно попадать сюда, так как внешние видео обработаны выше)
  console.log("[getVideoUrlForPlayback] Неизвестный тип видео, возвращаем null");
  return null;
}
