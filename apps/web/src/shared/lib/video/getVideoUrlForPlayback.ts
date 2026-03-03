"use server";

import { extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { getVideoForPlaybackCheck } from "@gafus/core/services/trainerVideo";

import { getSignedVideoUrl } from "./getSignedVideoUrl";

/**
 * Преобразует videoUrl в URL для воспроизведения.
 * Core проверяет статус; web генерирует signed URL (требует сессию и headers).
 */
export async function getVideoUrlForPlayback(
  videoUrl: string | null | undefined,
): Promise<string | null> {
  if (!videoUrl) return null;

  const externalPatterns = [
    /youtube\.com/,
    /youtu\.be/,
    /rutube\.ru/,
    /vimeo\.com/,
    /vk\.com\/video/,
    /vkvideo\.ru/,
  ];
  if (externalPatterns.some((p) => p.test(videoUrl))) return videoUrl;

  const isCDNVideo =
    videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
    videoUrl.includes("storage.yandexcloud.net/gafus-media");
  if (!isCDNVideo) return null;

  const videoId = extractVideoIdFromCdnUrl(videoUrl);
  if (!videoId) return null;

  try {
    const video = await getVideoForPlaybackCheck(videoId);
    if (!video || video.transcodingStatus !== "COMPLETED") return null;
    const signedUrl = await getSignedVideoUrl(videoId);
    return signedUrl ?? null;
  } catch (error) {
    console.error("[getVideoUrlForPlayback] Ошибка при поиске видео:", error);
    return null;
  }
}
