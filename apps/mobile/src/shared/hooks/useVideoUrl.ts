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
  // Логируем ВСЕГДА, даже если __DEV__ не установлен (для отладки)
  console.log("[useVideoUrl] ===== ХУК ВЫЗВАН =====", {
    videoUrl: videoUrl?.substring(0, 100) || "null",
    videoUrlLength: videoUrl?.length || 0,
    videoUrlType: typeof videoUrl,
    hasVideoUrl: !!videoUrl,
  });

  // Проверяем, является ли это CDN видео (мемоизируем, чтобы избежать пересчёта)
  const isCDN = useMemo(() => {
    if (!videoUrl) {
      if (__DEV__) {
        console.log("[useVideoUrl] useMemo isCDN: videoUrl пустой, возвращаем false");
      }
      return false;
    }
    const result =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");
    if (__DEV__) {
      console.log("[useVideoUrl] useMemo isCDN вычислен:", {
        videoUrl: videoUrl.substring(0, 100),
        isCDN: result,
        videoUrlLength: videoUrl.length,
        check1: videoUrl.includes("gafus-media.storage.yandexcloud.net"),
        check2: videoUrl.includes("storage.yandexcloud.net/gafus-media"),
      });
    }
    return result;
  }, [videoUrl]);

  // Для CDN видео не инициализируем с оригинальным URL, так как он может быть удалён после транскодирования
  // Для не-CDN видео (YouTube, VK) используем оригинальный URL сразу
  const [url, setUrl] = useState<string | null>(videoUrl && !isCDN ? videoUrl : null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (__DEV__) {
    console.log("[useVideoUrl] Состояние после useState:", {
      url: url?.substring(0, 100),
      isLoading,
      error,
      isCDN,
    });
  }

  useEffect(() => {
    // Логируем ВСЕГДА для отладки
    console.log("[useVideoUrl] ===== useEffect ВЫЗВАН =====", {
      videoUrl: videoUrl?.substring(0, 100) || "null",
      isCDN,
      videoUrlLength: videoUrl?.length || 0,
      videoUrlType: typeof videoUrl,
      hasVideoUrl: !!videoUrl,
    });

    try {
      if (!videoUrl) {
        if (__DEV__) {
          console.log("[useVideoUrl] videoUrl пустой, сбрасываем состояние");
        }
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
        console.log("[useVideoUrl] Проверка CDN:", {
          isCDN: isCDNVideo,
          videoUrl: videoUrl.substring(0, 100),
          videoUrlLength: videoUrl.length,
        });
      }

      if (isCDNVideo) {
        if (__DEV__) {
          console.log("[useVideoUrl] CDN видео, запрашиваем signed URL через API", {
            videoUrl: videoUrl.substring(0, 100),
          });
        }
        // Асинхронно получаем signed URL для HLS манифеста
        setIsLoading(true);
        setError(null);

        if (__DEV__) {
          console.log("[useVideoUrl] Вызываем trainingApi.getVideoUrl...");
        }

        trainingApi
          .getVideoUrl(videoUrl)
          .then((response) => {
            if (__DEV__) {
              console.log("[useVideoUrl] API ответ получен:", {
                success: response.success,
                hasData: !!response.data,
                url: response.data?.url?.substring(0, 100),
                error: response.error,
                code: response.code,
                // Полный ответ для отладки
                fullResponse: JSON.stringify(response, null, 2),
              });

              // Дополнительное логирование для ошибок
              if (!response.success) {
                console.error("[useVideoUrl] ОШИБКА получения видео URL:", {
                  videoUrl: videoUrl.substring(0, 100),
                  error: response.error,
                  code: response.code,
                  fullResponse: JSON.stringify(response, null, 2),
                });
              }
            }
            // Если url === null, это означает, что видео ещё не транскодировано или HLS не готов
            // В этом случае не используем fallback на оригинальный URL, так как он удалён после транскодирования
            if (response.success && response.data?.url) {
              if (__DEV__) {
                console.log("[useVideoUrl] Успешно получен URL, устанавливаем:", {
                  url: response.data.url.substring(0, 100),
                });
              }
              setUrl(response.data.url);
              setError(null);
            } else {
              // Если null или 404, это означает, что видео ещё не транскодировано
              if (response.code === "NOT_FOUND" || !response.data?.url) {
                if (__DEV__) {
                  console.warn("[useVideoUrl] Видео ещё обрабатывается или HLS не готов", {
                    code: response.code,
                  });
                }
                setUrl(null);
                setError(null); // Не показываем ошибку, если видео просто ещё обрабатывается
              } else {
                if (__DEV__) {
                  console.error("[useVideoUrl] Ошибка в ответе API:", {
                    error: response.error,
                    code: response.code,
                  });
                }
                setError(response.error || "Не удалось получить URL видео");
                setUrl(null);
              }
            }
          })
          .catch((err) => {
            if (__DEV__) {
              console.error("[useVideoUrl] Ошибка при получении signed URL:", err, {
                errorMessage: err instanceof Error ? err.message : String(err),
                errorStack: err instanceof Error ? err.stack : undefined,
              });
            }
            // При ошибке тоже не используем fallback, так как оригинальный файл может быть удалён
            setUrl(null);
            setError(err instanceof Error ? err.message : "Ошибка загрузки видео");
          })
          .finally(() => {
            if (__DEV__) {
              console.log("[useVideoUrl] Завершена обработка запроса");
            }
            setIsLoading(false);
          });
      } else {
        // Для не-CDN видео (YouTube, VK и т.д.) возвращаем URL как есть
        if (__DEV__) {
          console.log("[useVideoUrl] Не CDN видео, устанавливаем как есть", {
            videoUrl: videoUrl.substring(0, 100),
          });
        }
        setUrl(videoUrl);
        setIsLoading(false);
        setError(null);
      }
    } catch (error) {
      if (__DEV__) {
        console.error("[useVideoUrl] КРИТИЧЕСКАЯ ОШИБКА:", error, {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
      setError(error instanceof Error ? error.message : "Неизвестная ошибка");
      setUrl(null);
      setIsLoading(false);
    }
  }, [videoUrl, isCDN]);

  if (__DEV__) {
    console.log("[useVideoUrl] Возвращаем playbackUrl:", {
      url: url?.substring(0, 100),
      isLoading,
      error,
      videoUrl: videoUrl?.substring(0, 100),
      isCDN,
    });
  }
  return { url, isLoading, error };
}
