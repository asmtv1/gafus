import { useState, useEffect, useMemo, useRef } from "react";
import { trainingApi } from "@/shared/lib/api/training";

/**
 * Хук для получения URL видео для воспроизведения
 * Обрабатывает HLS видео и внешние видео (YouTube, VK и т.д.)
 * Повторяет логику из web версии
 */
const CDN_HOSTS = [
  "gafus-media.storage.yandexcloud.net",
  "storage.yandexcloud.net/gafus-media",
];

function isCdnUrl(url: string): boolean {
  return CDN_HOSTS.some((h) => url.includes(h));
}

export function useVideoUrl(videoUrl: string | null | undefined): {
  url: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const isCDN = useMemo(() => {
    if (!videoUrl) return false;
    return isCdnUrl(videoUrl);
  }, [videoUrl]);

  const [url, setUrl] = useState<string | null>(videoUrl && !isCDN ? videoUrl : null);
  const [isLoading, setIsLoading] = useState(() =>
    Boolean(videoUrl && isCdnUrl(videoUrl)),
  );
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!videoUrl) {
      if (__DEV__) {
        console.log("[useVideoUrl] videoUrl пустой, сбрасываем состояние");
      }
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const isCDNVideo = isCdnUrl(videoUrl);
    if (__DEV__) {
      console.log("[useVideoUrl] Проверка URL:", {
        videoUrl: videoUrl.slice(0, 80),
        isCDNVideo,
      });
    }

    if (!isCDNVideo) {
      if (__DEV__) {
        console.log("[useVideoUrl] Внешнее видео, используем напрямую");
      }
      setUrl(videoUrl);
      setIsLoading(false);
      setError(null);
      return;
    }

    const urlForRequest = videoUrl;
    setIsLoading(true);
    setError(null);

    if (__DEV__) {
      console.log("[useVideoUrl] Запрос signed URL для CDN видео:", urlForRequest.slice(0, 80));
    }

    trainingApi
      .getVideoUrl(urlForRequest)
      .then((response) => {
        if (!mountedRef.current) return;
        
        if (__DEV__) {
          console.log("[useVideoUrl] Ответ от API:", {
            success: response.success,
            hasUrl: !!response.data?.url,
            url: response.data?.url?.slice(0, 80),
            error: response.error,
            code: response.code,
          });
        }

        if (response.success && response.data?.url) {
          setUrl(response.data.url);
          setError(null);
        } else if (response.code === "NOT_FOUND" || !response.data?.url) {
          setUrl(null);
          setError(null);
        } else {
          const errorMsg = response.error || "Не удалось получить URL видео";
          if (__DEV__) {
            console.error("[useVideoUrl] Ошибка получения URL:", errorMsg);
          }
          setError(errorMsg);
          setUrl(null);
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        const errorMsg = err instanceof Error ? err.message : "Ошибка загрузки видео";
        if (__DEV__) {
          console.error("[useVideoUrl] Ошибка запроса:", errorMsg, err);
        }
        setUrl(null);
        setError(errorMsg);
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
  }, [videoUrl]);

  return { url, isLoading, error };
}
