"use client";

import { reportClientError } from "@gafus/error-handling";
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
    [videoUrl],
  );

  // Для CDN видео не инициализируем с оригинальным URL, так как он может быть удалён после транскодирования
  // Для не-CDN видео (YouTube, VK) используем оригинальный URL сразу
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(
    videoUrl && !isCDN ? videoUrl : null,
  );

  useEffect(() => {
    let isCurrent = true;

    if (!videoUrl) {
      setPlaybackUrl(null);
      return () => {
        isCurrent = false;
      };
    }

    // Проверяем, является ли это CDN видео
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (isCDNVideo) {
      // Асинхронно получаем signed URL для HLS манифеста
      getVideoUrlForPlayback(videoUrl)
        .then((url) => {
          if (!isCurrent) return;
          // Если url === null, это означает, что видео ещё не транскодировано или HLS не готов
          // В этом случае не используем fallback на оригинальный URL, так как он удалён после транскодирования
          if (url !== null) {
            setPlaybackUrl(url);
          } else {
            // Если null, возвращаем null, чтобы показать статус обработки пользователю
            setPlaybackUrl(null);
          }
        })
        .catch((error) => {
          if (!isCurrent) return;
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "VideoUrl",
            keys: { operation: "signed_url" },
          });
          setPlaybackUrl(null);
        });
    } else {
      // Для не-CDN видео (YouTube, VK и т.д.) возвращаем URL как есть
      setPlaybackUrl(videoUrl);
    }

    return () => {
      isCurrent = false;
    };
  }, [videoUrl]);

  return playbackUrl;
}
