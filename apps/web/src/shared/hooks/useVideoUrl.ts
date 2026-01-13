"use client";

import { useEffect, useState } from "react";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";

/**
 * Хук для получения URL видео с автоматическим преобразованием HLS URL в signed URL
 */
export function useVideoUrl(videoUrl: string | null | undefined): string | null {
  // Инициализируем с videoUrl, чтобы не было задержки при первом рендере
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(videoUrl || null);

  useEffect(() => {
    console.error("[useVideoUrl] === useEffect вызван === videoUrl:", videoUrl);
    console.log("[useVideoUrl] useEffect вызван, videoUrl:", videoUrl);

    if (!videoUrl) {
      console.error("[useVideoUrl] videoUrl пустой, устанавливаем null");
      setPlaybackUrl(null);
      return;
    }

    // Для CDN видео (не только HLS, но и MP4 которые могут быть транскодированы)
    const isCDN =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    console.error("[useVideoUrl] Проверка CDN:", { isCDN, videoUrl });

    if (isCDN) {
      console.error("[useVideoUrl] === CDN видео, вызываем getVideoUrlForPlayback ===");
      // Асинхронно получаем signed URL (функция сама определит HLS или MP4)
      getVideoUrlForPlayback(videoUrl)
        .then((url) => {
          console.error("[useVideoUrl] === getVideoUrlForPlayback ВЕРНУЛ ===", url);
          setPlaybackUrl(url || videoUrl);
        })
        .catch((error) => {
          console.error("[useVideoUrl] === ОШИБКА при получении signed URL ===", error);
          setPlaybackUrl(videoUrl); // Fallback на оригинальный URL
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
