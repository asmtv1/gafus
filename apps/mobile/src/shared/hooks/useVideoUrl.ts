import { reportClientError } from "@/shared/lib/tracer";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trainingApi } from "@/shared/lib/api/training";
import { resolveVideoUrlResponse } from "./videoUrlResponse";

/**
 * Хук для получения URL видео для воспроизведения
 * Обрабатывает HLS видео и внешние видео (YouTube, VK и т.д.)
 * Повторяет логику из web версии
 */
const CDN_HOSTS = ["gafus-media.storage.yandexcloud.net", "storage.yandexcloud.net/gafus-media"];

function isCdnUrl(url: string): boolean {
  return CDN_HOSTS.some((h) => url.includes(h));
}

export function useVideoUrl(videoUrl: string | null | undefined): {
  url: string | null;
  isLoading: boolean;
  error: string | null;
  videoId: string | null;
  retry: () => void;
} {
  const isCDN = useMemo(() => {
    if (!videoUrl) return false;
    return isCdnUrl(videoUrl);
  }, [videoUrl]);

  const [url, setUrl] = useState<string | null>(videoUrl && !isCDN ? videoUrl : null);
  const [isLoading, setIsLoading] = useState(() => Boolean(videoUrl && isCdnUrl(videoUrl)));
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const isActiveRequest = () => mountedRef.current && requestIdRef.current === requestId;

    if (!videoUrl) {
      if (__DEV__) {
        console.log("[useVideoUrl] videoUrl пустой, сбрасываем состояние");
      }
      setUrl(null);
      setIsLoading(false);
      setError(null);
      setVideoId(null);
      return;
    }

    const isCDNVideo = isCdnUrl(videoUrl);
    if (__DEV__) {
      console.log("[useVideoUrl] Проверка URL:", {
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
      setVideoId(null);
      return;
    }

    const urlForRequest = videoUrl;
    setUrl(null);
    setIsLoading(true);
    setError(null);
    setVideoId(null);

    if (__DEV__) {
      console.log("[useVideoUrl] Запрос signed URL для CDN видео");
    }

    trainingApi
      .getVideoUrl(urlForRequest)
      .then((response) => {
        if (!isActiveRequest()) return;

        if (__DEV__) {
          console.log("[useVideoUrl] Ответ от API:", {
            success: response.success,
            hasUrl: !!response.data?.url,
            error: response.error,
            code: response.code,
          });
        }

        const result = resolveVideoUrlResponse(response);
        if (result.url) {
          setUrl(result.url);
          setVideoId(result.videoId);
          setError(result.error);
        } else {
          if (__DEV__) {
            console.error("[useVideoUrl] Ошибка получения URL:", result.error);
          }
          setError(result.error);
          setUrl(null);
          setVideoId(null);
        }
      })
      .catch((err) => {
        if (!isActiveRequest()) return;
        reportClientError(err instanceof Error ? err : new Error(String(err)), {
          issueKey: "VideoUrl",
          keys: { operation: "signed_url" },
        });
        const errorMsg = err instanceof Error ? err.message : "Ошибка загрузки видео";
        setUrl(null);
        setError(errorMsg);
        setVideoId(null);
      })
      .finally(() => {
        if (isActiveRequest()) {
          setIsLoading(false);
        }
      });
  }, [videoUrl, retryAttempt]);

  const retry = useCallback(() => {
    setRetryAttempt((attempt) => attempt + 1);
  }, []);

  return { url, isLoading, error, videoId, retry };
}
