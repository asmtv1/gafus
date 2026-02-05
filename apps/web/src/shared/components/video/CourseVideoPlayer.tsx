"use client";

import { useEffect, useRef, useCallback } from "react";
import { CircularProgress } from "@shared/utils/muiImports";
import { PlayArrowIcon } from "@shared/utils/muiImports";

import styles from "./CourseVideoPlayer.module.css";

export interface CourseVideoPlayerProps {
  poster: string | null;
  playbackUrl: string | null;
  isLoading: boolean;
  onPlayRequest: () => void;
  initialTimeSec?: number;
  onSaveProgress?: (positionSec: number) => void;
  onError?: (error: Error) => void;
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
  videoClassName,
  wrapperClassName,
}: CourseVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<InstanceType<typeof import("hls.js").default> | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const hasAppliedInitialPositionRef = useRef<boolean>(false);

  const showOverlay = !playbackUrl || isLoading;
  const showPlayButton = !playbackUrl && !isLoading;

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
      playbackUrl.startsWith("/offline-hls/") ||
      playbackUrl.startsWith("blob:");

    if (!isHLS) {
      video.src = playbackUrl;
      return;
    }

    let isMounted = true;

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
              onError?.(new Error(`HLS error: ${data.type ?? "unknown"}`));
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  break;
              }
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playbackUrl;
        } else {
          console.error("[CourseVideoPlayer] HLS не поддерживается");
          onError?.(new Error("HLS not supported"));
        }
      })
      .catch((err) => {
        console.error("[CourseVideoPlayer] Ошибка загрузки hls.js:", err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackUrl, onError]);

  // Resume + автоплей после loadedmetadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (
        initialTimeSec != null &&
        initialTimeSec > 0 &&
        !hasAppliedInitialPositionRef.current &&
        video.duration
      ) {
        const safePosition = Math.min(initialTimeSec, video.duration);
        video.currentTime = safePosition;
        hasAppliedInitialPositionRef.current = true;
      }
      video.play().catch((e) => {
        console.warn("[CourseVideoPlayer] Автоплей заблокирован:", e);
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [initialTimeSec]);

  // Сохранение прогресса (throttle 5 сек)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onSaveProgress) return;

    const handleTimeUpdate = () => {
      const now = Date.now();
      const currentTime = video.currentTime || 0;
      if (currentTime < 5) return;
      if (now - lastSaveTimeRef.current < 5000) return;
      lastSaveTimeRef.current = now;
      onSaveProgress(Math.floor(currentTime));
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [onSaveProgress]);

  useEffect(() => {
    hasAppliedInitialPositionRef.current = false;
  }, [playbackUrl]);

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
      />
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
