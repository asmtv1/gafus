import { useState, useEffect, useMemo } from "react";
import { trainingApi } from "@/shared/lib/api/training";

/**
 * Хук для получения URL видео для воспроизведения
 * Обрабатывает HLS видео и внешние видео (YouTube, VK и т.д.)
 * Повторяет логику из web версии
 */
export function useVideoUrl(videoUrl: string | null | undefined): {
  url: string | null;
  isLoading: boolean;
  error: string | null;
} {
  // Проверяем, является ли это CDN видео (мемоизируем, чтобы избежать пересчёта)
  const isCDN = useMemo(
    () =>
      videoUrl?.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl?.includes("storage.yandexcloud.net/gafus-media"),
    [videoUrl]
  );

  // Для CDN видео не инициализируем с оригинальным URL, так как он может быть удалён после транскодирования
  // Для не-CDN видео (YouTube, VK) используем оригинальный URL сразу
  const [url, setUrl] = useState<string | null>(
    videoUrl && !isCDN ? videoUrl : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log("[useVideoUrl] useEffect вызван:", { videoUrl, isCDN });
    }

    try {
      if (!videoUrl) {
        setUrl(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      // Проверяем, является ли это CDN видео
      const isCDNVideo =
        videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
        videoUrl.includes("storage.yandexcloud.net/gafus-media");

      if (__DEV__) {
        console.log("[useVideoUrl] Проверка CDN:", { isCDN: isCDNVideo, videoUrl });
      }

      if (isCDNVideo) {
        if (__DEV__) {
          console.log("[useVideoUrl] CDN видео, запрашиваем signed URL через API");
        }
        // Асинхронно получаем signed URL для HLS манифеста
        setIsLoading(true);
        setError(null);

        trainingApi
          .getVideoUrl(videoUrl)
          .then((response) => {
            if (__DEV__) {
              console.log("[useVideoUrl] API ответ:", { 
                success: response.success, 
                hasData: !!response.data,
                url: response.data?.url,
                error: response.error,
                code: response.code,
              });
            }
            // Если url === null, это означает, что видео ещё не транскодировано или HLS не готов
            // В этом случае не используем fallback на оригинальный URL, так как он удалён после транскодирования
            if (response.success && response.data?.url) {
              setUrl(response.data.url);
              setError(null);
            } else {
              // Если null или 404, это означает, что видео ещё не транскодировано
              if (response.code === "NOT_FOUND" || !response.data?.url) {
                if (__DEV__) {
                  console.warn("[useVideoUrl] Видео ещё обрабатывается или HLS не готов");
                }
                setUrl(null);
                setError(null); // Не показываем ошибку, если видео просто ещё обрабатывается
              } else {
                setError(response.error || "Не удалось получить URL видео");
                setUrl(null);
              }
            }
          })
          .catch((err) => {
            if (__DEV__) {
              console.error("[useVideoUrl] Ошибка при получении signed URL:", err);
            }
            // При ошибке тоже не используем fallback, так как оригинальный файл может быть удалён
            setUrl(null);
            setError(err instanceof Error ? err.message : "Ошибка загрузки видео");
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        // Для не-CDN видео (YouTube, VK и т.д.) возвращаем URL как есть
        if (__DEV__) {
          console.log("[useVideoUrl] Не CDN видео, устанавливаем как есть");
        }
        setUrl(videoUrl);
        setIsLoading(false);
        setError(null);
      }
    } catch (error) {
      if (__DEV__) {
        console.error("[useVideoUrl] КРИТИЧЕСКАЯ ОШИБКА:", error);
      }
      setError(error instanceof Error ? error.message : "Неизвестная ошибка");
      setUrl(null);
      setIsLoading(false);
    }
  }, [videoUrl, isCDN]);

  if (__DEV__) {
    console.log("[useVideoUrl] Возвращаем playbackUrl:", url);
  }
  return { url, isLoading, error };
}
