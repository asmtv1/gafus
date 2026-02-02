"use client";

import { useEffect, useRef } from "react";

interface HLSVideoPlayerProps {
  src: string;
  poster?: string;
  controls?: boolean;
  className?: string;
  style?: React.CSSProperties;
  initialTimeSec?: number;
  onSaveProgress?: (positionSec: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Упрощенный HLS video player с поддержкой resume
 * - Использует preload="none" для lazy loading
 * - Применяет initialTimeSec в loadedmetadata
 * - Сохраняет прогресс через onSaveProgress (throttle 5 сек)
 */
export function HLSVideoPlayer({
  src,
  poster,
  controls = true,
  className,
  style,
  initialTimeSec,
  onSaveProgress,
  onError,
}: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const hasAppliedInitialPositionRef = useRef<boolean>(false);

  // Инициализация HLS с динамическим импортом hls.js (~250KB экономии bundle)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return;
    }

    // Проверяем что это HLS
    const isHLS =
      src.includes(".m3u8") ||
      src.includes("/manifest") ||
      src.startsWith("/offline-hls/") ||
      src.startsWith("blob:");

    if (!isHLS) {
      video.src = src;
      return;
    }

    // Динамически импортируем hls.js только когда нужно
    let isMounted = true;

    import("hls.js")
      .then((HlsModule) => {
        if (!isMounted) return;

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
          hls.loadSource(src);
          hls.attachMedia(video);

          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              console.error("[HLSVideoPlayer] Фатальная ошибка HLS:", data);
              if (onError) onError(new Error(`HLS error: ${data.type}`));

              // Попытка восстановления
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
          // Safari нативный HLS
          video.src = src;
        } else {
          console.error("[HLSVideoPlayer] HLS не поддерживается");
          if (onError) onError(new Error("HLS not supported"));
        }
      })
      .catch((error) => {
        console.error("[HLSVideoPlayer] Ошибка загрузки hls.js:", error);
        if (onError) onError(error);
      });

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, onError]);

  // Применение initialTimeSec при загрузке метаданных + автоплей
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (initialTimeSec && initialTimeSec > 0 && !hasAppliedInitialPositionRef.current && video.duration) {
        const safePosition = Math.min(initialTimeSec, video.duration);
        video.currentTime = safePosition;
        hasAppliedInitialPositionRef.current = true;
      }

      // Автоплей после загрузки метаданных (для one-click UX)
      video.play().catch((error) => {
        console.warn("[HLSVideoPlayer] Автоплей заблокирован браузером:", error);
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [initialTimeSec]);

  // Сохранение прогресса с throttle
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onSaveProgress) return;

    const handleTimeUpdate = () => {
      const now = Date.now();
      const currentTime = video.currentTime || 0;

      // Пропускаем первые 5 секунд
      if (currentTime < 5) return;

      // Throttle: не чаще раза в 5 секунд
      if (now - lastSaveTimeRef.current < 5000) return;

      lastSaveTimeRef.current = now;
      const positionSec = Math.floor(currentTime);
      onSaveProgress(positionSec);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [onSaveProgress]);

  // Сброс флага при изменении src
  useEffect(() => {
    hasAppliedInitialPositionRef.current = false;
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls={controls}
      preload="none"
      className={className}
      style={style}
      playsInline
    />
  );
}
