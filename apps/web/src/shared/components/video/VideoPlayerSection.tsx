"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Alert } from "@shared/utils/muiImports";
import { getCDNUrl } from "@gafus/cdn-upload";
import { CourseVideoPlayer } from "@shared/components/video/CourseVideoPlayer";
import { getVideoMetadata } from "@shared/lib/video/getVideoMetadata";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";
import { getVideoProgress, saveVideoProgress } from "@shared/lib/video/videoProgressActions";
import { reportClientError } from "@gafus/error-handling";
import type { VideoMetadata } from "@shared/lib/video/getVideoMetadata";
import styles from "./VideoPlayerSection.module.css";

interface VideoPlayerSectionProps {
  videoUrl: string | null;
  videoInfo?: {
    embedUrl: string;
    isShorts: boolean;
    isCDN?: boolean;
    isHLS?: boolean;
  } | null;
}

/**
 * Компонент для отображения видео с поддержкой превью (thumbnail)
 * - Для внешних видео (YouTube/VK): показывает iframe сразу
 * - Для CDN видео: показывает thumbnail, при клике загружает и воспроизводит видео
 */
export function VideoPlayerSection({
  videoUrl,
  videoInfo,
}: VideoPlayerSectionProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [initialTimeSec, setInitialTimeSec] = useState<number | undefined>(undefined);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false); // Флаг для ленивой загрузки
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const progressSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Мемоизируем videoId для предотвращения лишних ререндеров
  const videoId = useMemo(() => videoMetadata?.videoId, [videoMetadata?.videoId]);

  useEffect(() => {
    setSignedUrl(null);
    setVideoLoadError(null);
    setShouldLoadVideo(false);
    setInitialTimeSec(undefined);
    setRetryAttempt(0);
  }, [videoUrl]);

  // Загружаем метаданные видео при монтировании.
  useEffect(() => {
    if (!videoUrl) {
      setVideoMetadata(null);
      setIsLoadingMetadata(false);
      return;
    }

    let cancelled = false;
    setIsLoadingMetadata(true);
    setVideoMetadata(null);
    getVideoMetadata(videoUrl)
      .then((metadata) => {
        if (cancelled) return;
        setVideoMetadata(metadata);
      })
      .catch((error) => {
        if (cancelled) return;
        reportClientError(error, {
          severity: "error",
          issueKey: "VideoPlayerSection",
          keys: { operation: "video_metadata" },
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMetadata(false);
      });
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  // Загружаем прогресс просмотра при наличии videoId (универсально: онлайн/офлайн)
  useEffect(() => {
    if (!videoId) {
      setInitialTimeSec(undefined);
      return;
    }

    let cancelled = false;
    setInitialTimeSec(undefined);

    getVideoProgress(videoId)
      .then((progress) => {
        if (cancelled) return;
        if (progress && progress.lastPositionSec > 0) {
          setInitialTimeSec(progress.lastPositionSec);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        reportClientError(error, {
          severity: "error",
          issueKey: "VideoPlayerSection",
          keys: { operation: "video_progress_load" },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Колбэк для сохранения позиции просмотра (универсально: онлайн/офлайн)
  const handleSaveProgress = useCallback(
    (positionSec: number) => {
      if (!videoId) {
        return;
      }

      progressSaveQueueRef.current = progressSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await saveVideoProgress(videoId, positionSec);
          if (!result.success) {
            const errorMessage =
              "error" in result && typeof result.error === "string"
                ? result.error
                : "Не удалось сохранить прогресс видео";
            throw new Error(errorMessage);
          }
        })
        .catch((error) => {
          reportClientError(error, {
            severity: "error",
            issueKey: "VideoPlayerSection",
            keys: { operation: "video_progress_save" },
          });
        });
    },
    [videoId],
  );

  // Загружаем signed URL только когда пользователь кликнул на play (для CDN видео)
  useEffect(() => {
    if (!videoUrl || !shouldLoadVideo) {
      return;
    }

    let cancelled = false;
    setSignedUrl(null);
    setVideoLoadError(null);

    async function loadSignedUrl() {
      try {
        const url = await getVideoUrlForPlayback(videoUrl);

        if (cancelled) return;
        if (url) {
          setSignedUrl(url);
        } else {
          const error = new Error("Failed to get signed URL");
          setVideoLoadError(
            "Не удалось загрузить видео. Проверьте соединение и попробуйте ещё раз.",
          );
          reportClientError(error, {
            issueKey: "VideoPlayerSection",
            keys: { operation: "video_signed_url" },
          });
        }
      } catch (error) {
        if (cancelled) return;
        setVideoLoadError("Не удалось загрузить видео. Проверьте соединение и попробуйте ещё раз.");
        reportClientError(error, {
          severity: "error",
          issueKey: "VideoPlayerSection",
          keys: { operation: "video_signed_url" },
        });
      }
    }

    void loadSignedUrl();
    return () => {
      cancelled = true;
    };
  }, [videoUrl, shouldLoadVideo, retryAttempt]);

  const handleRetryVideo = useCallback(() => {
    setVideoLoadError(null);
    setSignedUrl(null);
    setShouldLoadVideo(true);
    setRetryAttempt((attempt) => attempt + 1);
  }, []);

  // Внешние видео (YouTube/VK) - показываем iframe сразу
  if (videoMetadata?.isExternal || (videoInfo && !videoInfo.isCDN && !videoInfo.isHLS)) {
    if (!videoInfo) {
      return (
        <div className={styles.videoContainer}>
          <LoadingState message="Загрузка видео…" />
        </div>
      );
    }

    return (
      <div className={styles.videoContainer}>
        <div
          className={`${styles.videoWrapper} ${videoInfo.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
        >
          <iframe
            src={videoInfo.embedUrl}
            title="Видео упражнения"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.videoIframe}
          />
        </div>
      </div>
    );
  }

  // Загрузка метаданных
  if (isLoadingMetadata) {
    return (
      <div className={styles.videoContainer}>
        <div
          className={styles.videoWrapper}
          style={{
            minHeight: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LoadingState message="Загрузка видео…" />
        </div>
      </div>
    );
  }

  // CDN видео в обработке (PENDING/PROCESSING)
  if (
    videoMetadata?.transcodingStatus === "PENDING" ||
    videoMetadata?.transcodingStatus === "PROCESSING"
  ) {
    return (
      <div className={styles.videoContainer}>
        <div
          className={styles.videoWrapper}
          style={{
            minHeight: "200px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <LoadingState
            message={videoMetadata.transcodingStatus === "PENDING"
              ? "Видео в очереди на обработку…"
              : "Видео обрабатывается…"}
          />
        </div>
      </div>
    );
  }

  // CDN видео FAILED
  if (videoMetadata?.transcodingStatus === "FAILED") {
    return (
      <div className={styles.videoContainer}>
        <div className={styles.videoWrapper} style={{ minHeight: "200px", padding: "20px" }}>
          <Alert severity="error" sx={{ width: "100%" }}>
            Ошибка обработки видео
          </Alert>
        </div>
      </div>
    );
  }

  // CDN видео COMPLETED - показываем thumbnail или плеер.
  if (
    videoMetadata?.transcodingStatus === "COMPLETED" ||
    (!videoMetadata && videoInfo?.isHLS)
  ) {
    const thumbnailSrc = videoMetadata?.thumbnailPath
      ? getCDNUrl(videoMetadata.thumbnailPath)
      : null;

    // Один кастомный плеер: обложка и <video> в одном контейнере, по клику — HLS без смены DOM
    return (
      <div className={styles.videoContainer}>
        <CourseVideoPlayer
          key={retryAttempt}
          poster={thumbnailSrc}
          playbackUrl={signedUrl}
          isLoading={shouldLoadVideo && !signedUrl}
          onPlayRequest={() => setShouldLoadVideo(true)}
          initialTimeSec={initialTimeSec}
          onSaveProgress={handleSaveProgress}
          errorMessage={videoLoadError}
          onRetry={handleRetryVideo}
          onError={(error) => {
            setVideoLoadError("Не удалось воспроизвести видео. Попробуйте загрузить его заново.");
            reportClientError(error, {
              severity: "error",
              issueKey: "VideoPlayerSection",
              keys: { operation: "video_playback" },
            });
          }}
          videoClassName={styles.videoIframe}
          wrapperClassName={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
        />
      </div>
    );
  }

  // Fallback для других случаев
  return (
    <div className={styles.videoContainer}>
      <div className={styles.videoWrapper} style={{ minHeight: "200px", padding: "20px" }}>
        <Alert severity="info" sx={{ width: "100%" }}>
          Видео недоступно
        </Alert>
      </div>
    </div>
  );
}
