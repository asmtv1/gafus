"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Box, CircularProgress, Typography } from "@mui/material";

interface HLSVideoPlayerProps {
  src: string; // URL видео (HLS манифест)
  poster?: string; // Постер видео
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
}

/**
 * Компонент для воспроизведения HLS видео
 * - Использует hls.js для HLS воспроизведения
 * - Поддерживает нативную поддержку HLS в Safari
 * - Поддерживает офлайн-режим (blob URLs из IndexedDB)
 */
export function HLSVideoPlayer({
  src,
  poster,
  autoplay = false,
  controls = true,
  loop = false,
  muted = false,
  className,
  style,
  onError,
}: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      console.log("[HLSVideoPlayer] Нет video элемента или src:", { video: !!video, src });
      return;
    }

    console.log("[HLSVideoPlayer] Начало настройки, src:", src);

    // Проверяем HLS по расширению .m3u8 или по пути /manifest (signed URL)
    const isHLS = src.includes(".m3u8") || (src.includes("/api/video/") && src.includes("/manifest"));
    
    // Проверяем feature flag для HLS
    const hlsEnabled = process.env.NEXT_PUBLIC_ENABLE_HLS_PROTECTION !== "false";

    console.log("[HLSVideoPlayer] Проверка формата:", { isHLS, hlsEnabled, src });

    // Если HLS отключён, показываем ошибку
    if (!hlsEnabled && isHLS) {
      console.log("[HLSVideoPlayer] HLS отключён");
      setError("HLS воспроизведение временно отключено");
      setIsLoading(false);
      return;
    }

    // Поддерживается только HLS формат
    if (isHLS) {
      console.log("[HLSVideoPlayer] HLS формат, настраиваем hls.js");
      // HLS воспроизведение через hls.js
      if (Hls.isSupported()) {
        console.log("[HLSVideoPlayer] hls.js поддерживается");
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90, // Кэш 90 секунд назад
          // Таймауты и retry
          fragLoadingTimeOut: 20000, // 20 секунд вместо 10
          fragLoadingMaxRetry: 4, // 4 попытки вместо 3
          fragLoadingRetryDelay: 1000, // 1 секунда задержка
          fragLoadingMaxRetryTimeout: 60000, // 60 секунд максимум
          // Буферизация
          maxBufferLength: 30, // Максимальный буфер 30 секунд
          maxMaxBufferLength: 60, // Абсолютный максимум 60 секунд
          maxBufferSize: 60 * 1000 * 1000, // 60MB максимум
          maxBufferHole: 0.5, // Максимальная дыра в буфере 0.5 секунды
        });

        hlsRef.current = hls;

        console.log("[HLSVideoPlayer] Загружаем HLS манифест:", src);
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("[HLSVideoPlayer] Манифест распарсен успешно");
          setIsLoading(false);
          
          if (autoplay) {
            video.play().catch((err) => {
              console.warn("Autoplay blocked:", err);
            });
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error("[HLSVideoPlayer] Фатальная ошибка HLS:", data);
            setError("Ошибка загрузки видео");
            setIsLoading(false);

            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error("[HLSVideoPlayer] Network error, пытаемся перезагрузить");
                hls.startLoad(); // Пытаемся перезагрузить
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error("[HLSVideoPlayer] Media error, пытаемся восстановиться");
                hls.recoverMediaError();
                break;
              default:
                console.error("[HLSVideoPlayer] Критическая ошибка HLS");
                // Критическая ошибка, не можем восстановиться
                if (onError) {
                  onError(new Error(data.details || "HLS playback error"));
                }
                break;
            }
          } else {
            // Нефатальные ошибки - hls.js автоматически восстановится
            // Логируем только для отладки
            switch (data.details) {
              case "fragLoadTimeOut":
              case "bufferSeekOverHole":
              case "bufferStalledError":
                // Эти ошибки обрабатываются автоматически hls.js
                break;
            }
          }
        });

        return () => {
          console.log("[HLSVideoPlayer] Cleanup hls.js");
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        console.log("[HLSVideoPlayer] Нативная поддержка HLS (Safari)");
        // Нативная поддержка HLS (Safari)
        video.src = src;
        setIsLoading(false);
        
        if (autoplay) {
          video.play().catch((err) => {
            console.warn("Autoplay blocked:", err);
          });
        }
      } else {
        console.error("[HLSVideoPlayer] HLS не поддерживается в браузере");
        setError("HLS не поддерживается в этом браузере");
        setIsLoading(false);
        if (onError) {
          onError(new Error("HLS not supported"));
        }
      }
    } else {
      // Неподдерживаемый формат видео (должен быть только HLS)
      console.error("[HLSVideoPlayer] Неподдерживаемый формат видео (требуется HLS):", src);
      setError("Неподдерживаемый формат видео");
      setIsLoading(false);
      if (onError) {
        onError(new Error("Unsupported video format"));
      }
    }

    // Обработка загрузки
    const handleLoadedData = () => {
      setIsLoading(false);
    };

    video.addEventListener("loadeddata", handleLoadedData);

    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoplay, onError]);

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          bgcolor: "grey.900",
          color: "error.main",
          borderRadius: 1,
          p: 3,
        }}
      >
        <Typography variant="h6" gutterBottom>
          Ошибка воспроизведения
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", width: "100%", ...style }} className={className}>
      {isLoading && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
          }}
        >
          <CircularProgress />
        </Box>
      )}
      
      <video
        ref={videoRef}
        poster={poster}
        controls={controls}
        loop={loop}
        muted={muted}
        controlsList="nodownload"
        disablePictureInPicture
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: isLoading ? "none" : "block",
          backgroundColor: "black",
        }}
      />
    </Box>
  );
}
