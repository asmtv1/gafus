"use client";
// подумать над выносом в отдельный пакет
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Box, CircularProgress, Typography } from "@mui/material";

interface HLSVideoPlayerProps {
  src: string | null; // URL видео (HLS манифест) - может быть null для ленивой загрузки
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
  const [isBuffering, setIsBuffering] = useState(false);
  const shouldLoadVideoRef = useRef(false);
  const hasAttemptedPlayRef = useRef(false); // Флаг для предотвращения множественных вызовов play()

  // Критично: Когда src устанавливается (пользователь кликнул на обложку), автоматически разрешаем загрузку
  // Это гарантирует, что видео загрузится, когда VideoPlayerSection передаст src после клика
  // Сбрасываем hasAttemptedPlayRef при изменении src (новое видео)
  // Используем useRef вместо useState чтобы не вызывать пересоздание useEffect
  useEffect(() => {
    if (src && !shouldLoadVideoRef.current) {
      shouldLoadVideoRef.current = true; // Разрешаем загрузку когда src установлен
      hasAttemptedPlayRef.current = false; // Сбрасываем флаг для нового видео
    }
    // Сбрасываем флаги если src удален (возврат к обложке)
    if (!src) {
      shouldLoadVideoRef.current = false;
      hasAttemptedPlayRef.current = false;
    }
  }, [src]); // Только src в зависимостях - флаги в ref не вызывают пересоздание эффекта

  // Обработчик handlePlay и обработка события play удалены
  // Теперь shouldLoadVideo устанавливается автоматически через useEffect при установке src
  // Это происходит когда VideoPlayerSection передает src после клика пользователя на обложку

  useEffect(() => {
    const video = videoRef.current;
    // Критично: не загружаем если src нет или пользователь еще не нажал Play
    if (!video || !src || !shouldLoadVideoRef.current) {
      return;
    }

    // Проверяем HLS по расширению .m3u8, по пути /manifest (signed URL), Service Worker URL или blob URL
    const isHLS = src.includes(".m3u8") || 
                  (src.includes("/api/video/") && src.includes("/manifest")) ||
                  src.startsWith("/offline-hls/") ||
                  src.startsWith("blob:");
    
    // Проверяем feature flag для HLS
    const hlsEnabled = process.env.NEXT_PUBLIC_ENABLE_HLS_PROTECTION !== "false";

    // Если HLS отключён, показываем ошибку
    if (!hlsEnabled && isHLS) {
      setError("HLS воспроизведение временно отключено");
      setIsLoading(false);
      return;
    }

    // Поддерживается только HLS формат
    if (isHLS) {
      // HLS воспроизведение через hls.js
      if (Hls.isSupported()) {
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

        // Критично: загружаем HLS только после клика пользователя
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          
          // Критично: Автозапуск сразу после готовности манифеста (если был клик пользователя)
          if (shouldLoadVideoRef.current && !hasAttemptedPlayRef.current && video) {
            hasAttemptedPlayRef.current = true;
            // Используем requestAnimationFrame для небольшой задержки (позволяет HLS начать буферизацию)
            requestAnimationFrame(() => {
              if (video && video.paused) {
                video.play().catch((err) => {
                  console.warn("[HLSVideoPlayer] Autoplay blocked, user can click Play:", err);
                  hasAttemptedPlayRef.current = false; // Разрешаем повторную попытку через UI
                });
              }
            });
          }
        });

        // Отслеживаем буферизацию
        hls.on(Hls.Events.BUFFER_APPENDING, () => {
          setIsBuffering(true);
        });

        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          setIsBuffering(false);
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
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Нативная поддержка HLS (Safari)
        // Критично: устанавливаем src только после клика пользователя
        video.src = src;
        setIsLoading(false);
        
        // Функция для попытки воспроизведения
        const tryPlaySafari = () => {
          if (shouldLoadVideoRef.current && !hasAttemptedPlayRef.current && video.paused) {
            hasAttemptedPlayRef.current = true;
            video.play().catch((err) => {
              console.warn("[HLSVideoPlayer] Autoplay blocked, user can click Play:", err);
              hasAttemptedPlayRef.current = false;
            });
          }
        };
        
        // Обработчики для Safari
        const handleSafariLoadedMetadata = () => {
          // Проверяем readyState сразу
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            tryPlaySafari();
          }
        };
        
        const handleSafariLoadedData = () => {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            tryPlaySafari();
          }
        };
        
        const handleSafariCanPlay = () => {
          if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            tryPlaySafari();
          }
        };
        
        video.addEventListener("loadedmetadata", handleSafariLoadedMetadata);
        video.addEventListener("loadeddata", handleSafariLoadedData);
        video.addEventListener("canplay", handleSafariCanPlay);
        
        // Критично: если видео уже готово, вызываем сразу
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          tryPlaySafari();
        }
        
        return () => {
          video.removeEventListener("loadedmetadata", handleSafariLoadedMetadata);
          video.removeEventListener("loadeddata", handleSafariLoadedData);
          video.removeEventListener("canplay", handleSafariCanPlay);
        };
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
      console.error("[HLSVideoPlayer] Неподдерживаемый формат видео (требуется HLS)");
      setError("Неподдерживаемый формат видео");
      setIsLoading(false);
      if (onError) {
        onError(new Error("Unsupported video format"));
      }
    }

    // Обработка загрузки - используем события video для более точного определения готовности
    const handleLoadedMetadata = () => {
      // Подстраховка: если MANIFEST_PARSED не сработал, пробуем здесь
      if (shouldLoadVideoRef.current && !hasAttemptedPlayRef.current && video.paused) {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          hasAttemptedPlayRef.current = true;
          video.play().catch((err) => {
            console.warn("[HLSVideoPlayer] Autoplay blocked:", err);
            hasAttemptedPlayRef.current = false;
          });
        }
      }
    };

    const handleLoadedData = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsLoading(false);
      
      // Подстраховка: если play() еще не был вызван (например, в MANIFEST_PARSED не сработал)
      if (shouldLoadVideoRef.current && video.paused && !hasAttemptedPlayRef.current) {
        hasAttemptedPlayRef.current = true;
        video.play().catch((err) => {
          console.warn("[HLSVideoPlayer] Autoplay blocked, user can click Play:", err);
          hasAttemptedPlayRef.current = false;
        });
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, onError]); // Убрать shouldLoadVideo и hasAttemptedPlay - используем ref

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

  // Показываем спиннер только при активной буферизации, не скрывая video
  const showSpinner = isLoading || isBuffering;

  return (
    <Box sx={{ position: "relative", width: "100%", ...style }} className={className}>
      {/* Спиннер поверх video, не скрывая его */}
      {showSpinner && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <CircularProgress sx={{ color: "white" }} />
        </Box>
      )}
      
      {/* Video элемент всегда виден, poster показывается браузером автоматически */}
      {/* Критично: preload="none" для предотвращения загрузки до клика (подстраховка) */}
      {/* Критично: playsinline для iOS - без него видео может не воспроизводиться или открыться на весь экран */}
      <video
        ref={videoRef}
        poster={poster}
        preload="none"
        playsInline
        controls={controls}
        loop={loop}
        muted={muted}
        controlsList="nodownload"
        disablePictureInPicture
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          backgroundColor: "black",
        }}
      />
    </Box>
  );
}
