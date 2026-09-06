"use client";

import { useCallback, useEffect, useRef } from "react";

import { reportClientError } from "@gafus/error-handling";
import { getSafeVideoResumePosition } from "@gafus/core/utils";
import type HlsType from "hls.js";
import { CircularProgress } from "@shared/utils/muiImports";
import { PlayArrowIcon } from "@shared/utils/muiImports";

import styles from "./CourseVideoPlayer.module.css";
import { PrimaryButton } from "@/shared/components/ui";

export interface CourseVideoPlayerProps {
  poster: string | null;
  playbackUrl: string | null;
  isLoading: boolean;
  onPlayRequest: () => void;
  initialTimeSec?: number;
  onSaveProgress?: (positionSec: number) => void;
  onError?: (error: Error) => void;
  errorMessage?: string | null;
  onRetry?: () => void;
  videoClassName?: string;
  wrapperClassName?: string;
}

/**
 * Кастомный плеер под курс: один <video>, обложка, по клику — init HLS без смены контейнера.
 * Обложка и видео живут в одном DOM-дереве, перерендеров при переходе в воспроизведение нет.
 */
export function CourseVideoPlayer({
  poster,
  playbackUrl,
  isLoading,
  onPlayRequest,
  initialTimeSec,
  onSaveProgress,
  onError,
  errorMessage,
  onRetry,
  videoClassName,
  wrapperClassName,
}: CourseVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastSavedPositionRef = useRef<number | null>(null);
  const hasAppliedInitialPositionRef = useRef<boolean>(false);
  const onSaveProgressRef = useRef(onSaveProgress);
  const onErrorRef = useRef(onError);
  const hasEndedRef = useRef(false);

  const showOverlay = !errorMessage && (!playbackUrl || isLoading);
  const showPlayButton = !errorMessage && !playbackUrl && !isLoading;

  useEffect(() => {
    onSaveProgressRef.current = onSaveProgress;
  }, [onSaveProgress]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const handleOverlayClick = useCallback(() => {
    if (showPlayButton) {
      onPlayRequest();
    }
  }, [showPlayButton, onPlayRequest]);

  // Инициализация HLS при появлении playbackUrl (один и тот же video element)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      return;
    }

    const isHLS =
      playbackUrl.includes(".m3u8") ||
      playbackUrl.includes("/manifest") ||
      playbackUrl.startsWith("blob:");

    if (!isHLS) {
      video.src = playbackUrl;
      return;
    }

    let isMounted = true;
    let networkRecoveryAttempted = false;
    let mediaRecoveryAttempted = false;

    import("hls.js")
      .then((HlsModule) => {
        if (!isMounted || !videoRef.current) return;

        const Hls = HlsModule.default;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 4,
            maxBufferLength: 30,
          });

          hlsRef.current = hls;
          hls.loadSource(playbackUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
            if (data.fatal) {
              console.error("[CourseVideoPlayer] Фатальная ошибка HLS:", data);
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  if (!networkRecoveryAttempted) {
                    networkRecoveryAttempted = true;
                    hls.startLoad();
                  } else {
                    onErrorRef.current?.(new Error("Не удалось загрузить видеопоток"));
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  if (!mediaRecoveryAttempted) {
                    mediaRecoveryAttempted = true;
                    hls.recoverMediaError();
                  } else {
                    onErrorRef.current?.(new Error("Не удалось декодировать видеопоток"));
                  }
                  break;
                default:
                  onErrorRef.current?.(new Error(`HLS error: ${data.type ?? "unknown"}`));
                  break;
              }
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playbackUrl;
        } else {
          console.error("[CourseVideoPlayer] HLS не поддерживается");
          onErrorRef.current?.(new Error("HLS not supported"));
        }
      })
      .catch((err) => {
        reportClientError(err, {
          issueKey: "CourseVideoPlayer",
          keys: { operation: "load_hls_module" },
        });
        console.error("[CourseVideoPlayer] Ошибка загрузки hls.js:", err);
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackUrl]);

  // Resume + автоплей после loadedmetadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyInitialPosition = () => {
      if (
        initialTimeSec != null &&
        initialTimeSec > 0 &&
        !hasAppliedInitialPositionRef.current &&
        video.currentTime <= 2 &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        const safePosition = getSafeVideoResumePosition(initialTimeSec, video.duration);
        if (safePosition != null) {
          video.currentTime = safePosition;
          hasAppliedInitialPositionRef.current = true;
        }
      }
    };

    const handleLoadedMetadata = () => {
      applyInitialPosition();
      video.play().catch((e) => {
        // Блокировка autoplay — штатное ограничение браузера, пользователь может нажать play.
        console.warn("[CourseVideoPlayer] Автоплей заблокирован:", e);
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      applyInitialPosition();
    }
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [initialTimeSec]);

  // Сохранение прогресса: throttle во время просмотра и flush на паузе/уходе.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const saveCurrentPosition = (force = false) => {
      const saveProgress = onSaveProgressRef.current;
      if (!saveProgress) return;
      const position = Math.max(0, Math.floor(video.currentTime || 0));
      if (position === 0) return;
      if (!force && position < 5) return;
      if (lastSavedPositionRef.current === position) return;
      lastSavedPositionRef.current = position;
      saveProgress(position);
    };

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSaveTimeRef.current < 5000) return;
      lastSaveTimeRef.current = now;
      saveCurrentPosition();
    };
    const handlePause = () => {
      if (!hasEndedRef.current) saveCurrentPosition(true);
    };
    const handleEnded = () => {
      hasEndedRef.current = true;
      lastSavedPositionRef.current = null;
      onSaveProgressRef.current?.(0);
    };
    const handlePlay = () => {
      hasEndedRef.current = false;
    };
    const handlePageHide = () => {
      if (!hasEndedRef.current) saveCurrentPosition(true);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      if (!hasEndedRef.current) saveCurrentPosition(true);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [playbackUrl]);

  useEffect(() => {
    hasAppliedInitialPositionRef.current = false;
    lastSavedPositionRef.current = null;
    hasEndedRef.current = false;
  }, [playbackUrl]);

  const handleNativeVideoError = useCallback(() => {
    const mediaError = videoRef.current?.error;
    onErrorRef.current?.(
      new Error(
        mediaError?.message || `Video playback error${mediaError ? ` (${mediaError.code})` : ""}`,
      ),
    );
  }, []);

  return (
    <div
      className={`${wrapperClassName ?? ""} ${styles.root}`.trim()}
      data-clickable={showPlayButton ? true : undefined}
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        controls
        preload="none"
        className={`${videoClassName ?? ""} ${styles.video}`.trim()}
        playsInline
        onError={handleNativeVideoError}
      />
      {errorMessage && (
        <div className={styles.errorOverlay} role="alert">
          <p className={styles.errorText}>{errorMessage}</p>
          {onRetry && (
            <PrimaryButton type="button" className={styles.retryButton} onClick={onRetry}>
              Повторить
            </PrimaryButton>
          )}
        </div>
      )}
      {showOverlay && (
        <button
          type="button"
          className={styles.overlay}
          aria-label={showPlayButton ? "Воспроизвести" : "Загрузка"}
          onClick={handleOverlayClick}
          disabled={!showPlayButton}
        >
          {showPlayButton ? (
            <PlayArrowIcon className={styles.playIcon} />
          ) : (
            <CircularProgress className={styles.loadingIcon} size={32} />
          )}
        </button>
      )}
    </div>
  );
}
