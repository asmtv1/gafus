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
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const isCDNVideo = isCdnUrl(videoUrl);
    if (!isCDNVideo) {
      setUrl(videoUrl);
      setIsLoading(false);
      setError(null);
      return;
    }

    const urlForRequest = videoUrl;
    setIsLoading(true);
    setError(null);

    trainingApi
      .getVideoUrl(urlForRequest)
      .then((response) => {
        if (!mountedRef.current) return;
        if (response.success && response.data?.url) {
          setUrl(response.data.url);
          setError(null);
        } else if (response.code === "NOT_FOUND" || !response.data?.url) {
          setUrl(null);
          setError(null);
        } else {
          setError(response.error || "Не удалось получить URL видео");
          setUrl(null);
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setUrl(null);
        setError(err instanceof Error ? err.message : "Ошибка загрузки видео");
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
  }, [videoUrl]);

  return { url, isLoading, error };
}
