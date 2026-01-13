"use client";

import { useEffect, useMemo, useState } from "react";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";

/**
 * Хук для получения URL видео с автоматическим преобразованием HLS URL в signed URL
 */
export function useVideoUrl(videoUrl: string | null | undefined): string | null {
  // Проверяем, является ли это CDN видео (мемоизируем, чтобы избежать пересчёта)
  const isCDN = useMemo(
    () =>
      videoUrl?.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl?.includes("storage.yandexcloud.net/gafus-media"),
    [videoUrl]
  );

  // Для CDN видео не инициализируем с оригинальным URL, так как он может быть удалён после транскодирования
  // Для не-CDN видео (YouTube, VK) используем оригинальный URL сразу
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(
    videoUrl && !isCDN ? videoUrl : null
  );

  useEffect(() => {
    console.error("[useVideoUrl] === useEffect вызван === videoUrl:", videoUrl);
    console.log("[useVideoUrl] useEffect вызван, videoUrl:", videoUrl);

    if (!videoUrl) {
      console.error("[useVideoUrl] videoUrl пустой, устанавливаем null");
      setPlaybackUrl(null);
      return;
    }

    // Проверяем, является ли это CDN видео
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    console.error("[useVideoUrl] Проверка CDN:", { isCDN: isCDNVideo, videoUrl });

    if (isCDNVideo) {
      console.error("[useVideoUrl] === CDN видео, вызываем getVideoUrlForPlayback ===");
      // Асинхронно получаем signed URL (функция сама определит HLS или MP4)
      getVideoUrlForPlayback(videoUrl)
        .then((url) => {
          console.error("[useVideoUrl] === getVideoUrlForPlayback ВЕРНУЛ ===", url);
          // Если url === null, это означает, что видео транскодировано, но signed URL не получен
          // В этом случае не используем fallback на оригинальный URL, так как он удалён
          if (url !== null) {
            setPlaybackUrl(url);
          } else {
            // Если null, оставляем оригинальный URL только если видео ещё не транскодировано
            // Но лучше вернуть null, чтобы показать ошибку пользователю
            console.error("[useVideoUrl] getVideoUrlForPlayback вернул null - возможно, видео транскодировано, но signed URL не получен");
            setPlaybackUrl(null);
          }
        })
        .catch((error) => {
          console.error("[useVideoUrl] === ОШИБКА при получении signed URL ===", error);
          // При ошибке тоже не используем fallback, так как оригинальный файл может быть удалён
          setPlaybackUrl(null);
        });
    } else {
      // Для не-CDN видео (YouTube, VK и т.д.) возвращаем URL как есть
      console.error("[useVideoUrl] Не CDN видео, устанавливаем как есть");
      setPlaybackUrl(videoUrl);
    }
  }, [videoUrl]);

  console.log("[useVideoUrl] Возвращаем playbackUrl:", playbackUrl);
  return playbackUrl;
}
