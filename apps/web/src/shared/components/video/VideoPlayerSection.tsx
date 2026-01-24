"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, CircularProgress, Alert, Typography } from "@shared/utils/muiImports";
import { PlayArrowIcon } from "@shared/utils/muiImports";
import { HLSVideoPlayer } from "./HLSVideoPlayer";
import { getCDNUrl } from "@gafus/cdn-upload";
import { getVideoMetadata } from "@shared/lib/video/getVideoMetadata";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";
import { getSignedVideoUrl } from "@shared/lib/video/getSignedVideoUrl";
import { getOfflineCourseByType } from "@shared/lib/offline/offlineCourseStorage";
import type { VideoMetadata } from "@shared/lib/video/getVideoMetadata";
import styles from "@/features/training/components/AccordionStep/AccordionStep.module.css";

interface VideoPlayerSectionProps {
  videoUrl: string | null; // URL для воспроизведения (может быть blob URL для офлайн)
  originalVideoUrl?: string | null; // Оригинальный URL для получения метаданных
  courseType?: string | null; // Тип курса для доступа к IndexedDB
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
  originalVideoUrl,
  courseType,
  videoInfo,
}: VideoPlayerSectionProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [offlineThumbnail, setOfflineThumbnail] = useState<Blob | null>(null);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false); // Состояние воспроизведения для ленивой загрузки

  // Определяем, является ли videoUrl Service Worker URL для офлайн видео
  // Мемоизируем для предотвращения лишних ререндеров
  const isOfflineVideo = useMemo(() => videoUrl?.startsWith("/offline-hls/") ?? false, [videoUrl]);
  // Используем originalVideoUrl для метаданных, если videoUrl это Service Worker URL
  // Мемоизируем для предотвращения лишних ререндеров
  const urlForMetadata = useMemo(
    () => (isOfflineVideo && originalVideoUrl ? originalVideoUrl : videoUrl),
    [isOfflineVideo, originalVideoUrl, videoUrl],
  );

  // Для офлайн видео signedUrl не нужен, используем videoUrl напрямую

  // Мемоизируем videoId для предотвращения лишних ререндеров
  const videoId = useMemo(() => videoMetadata?.videoId, [videoMetadata?.videoId]);

  // Загружаем thumbnail из IndexedDB для офлайн режима
  useEffect(() => {
    if (!isOfflineVideo || !courseType || !videoUrl) {
      setOfflineThumbnail(null);
      setThumbnailBlobUrl(null);
      return;
    }

    // Получаем курс из IndexedDB
    getOfflineCourseByType(courseType)
      .then((offlineCourse) => {
        if (!offlineCourse) {
          return null;
        }

        const hlsVideos = offlineCourse.mediaFiles.hlsVideos;
        let hlsVideo = hlsVideos[videoUrl];

        // Если не найдено по точному совпадению, ищем по videoId из метаданных
        if (!hlsVideo && videoId) {
          for (const [, value] of Object.entries(hlsVideos)) {
            if (value.videoId === videoId) {
              hlsVideo = value;
              break;
            }
          }
        }

        // Если не найдено, пробуем найти по originalVideoUrl
        if (!hlsVideo && originalVideoUrl) {
          hlsVideo = hlsVideos[originalVideoUrl];
        }

        // Если найдено видео и есть thumbnailPath, получаем thumbnail
        if (hlsVideo?.thumbnailPath) {
          const thumbnailBlob = offlineCourse.mediaFiles.images[hlsVideo.thumbnailPath];
          if (thumbnailBlob) {
            setOfflineThumbnail(thumbnailBlob);
            // Создаём blob URL для thumbnail
            const blobUrl = URL.createObjectURL(thumbnailBlob);
            setThumbnailBlobUrl(blobUrl);
            return;
          }
        }

        return null;
      })
      .catch((error) => {
        console.error("[VideoPlayerSection] Ошибка получения thumbnail из IndexedDB:", error);
      });
  }, [isOfflineVideo, courseType, videoUrl, originalVideoUrl, videoId]);

  // Очищаем blob URL для thumbnail при размонтировании или изменении
  useEffect(() => {
    return () => {
      if (thumbnailBlobUrl) {
        URL.revokeObjectURL(thumbnailBlobUrl);
      }
    };
  }, [thumbnailBlobUrl]);

  // Загружаем метаданные видео при монтировании (используем originalVideoUrl если videoUrl это blob)
  useEffect(() => {
    if (!urlForMetadata) {
      return;
    }

    setIsLoadingMetadata(true);
    getVideoMetadata(urlForMetadata)
      .then((metadata) => {
        setVideoMetadata(metadata);
      })
      .catch((error) => {
        console.error("[VideoPlayerSection] Ошибка получения метаданных:", error);
      })
      .finally(() => {
        setIsLoadingMetadata(false);
      });
  }, [urlForMetadata]);

  // Загружаем signed URL при клике на thumbnail (только для онлайн видео)
  // Мемоизирован для предотвращения лишних ререндеров
  const handleThumbnailClick = useCallback(async () => {
    if (!videoUrl) {
      return;
    }

    // Устанавливаем состояние воспроизведения для отображения плеера
    setIsPlaying(true);

    // Для офлайн видео (Service Worker URL) ничего не делаем - плеер уже готов
    if (isOfflineVideo) {
      return;
    }

    // Если signed URL уже загружен, ничего не делаем
    if (signedUrl) {
      return;
    }

    setIsLoadingSignedUrl(true);
    try {
      let url: string | null = null;

      // Если есть videoId в метаданных, используем его для получения signed URL
      if (videoId) {
        url = await getSignedVideoUrl(videoId);
      }

      // Если не получили через videoId, используем getVideoUrlForPlayback
      if (!url) {
        url = await getVideoUrlForPlayback(videoUrl);
      }

      if (url) {
        setSignedUrl(url);
      } else {
        console.error("[VideoPlayerSection] Не удалось получить signed URL");
      }
    } catch (error) {
      console.error("[VideoPlayerSection] Ошибка получения signed URL:", error);
    } finally {
      setIsLoadingSignedUrl(false);
    }
  }, [videoUrl, isOfflineVideo, signedUrl, videoId]);

  // Рендерим кастомную обложку с кнопкой Play
  const renderPosterWithPlayButton = useCallback(
    (thumbnailSrc: string | null) => {
      return (
        <div className={styles.videoContainer}>
          <div
            className={styles.videoWrapper}
            onClick={handleThumbnailClick}
            style={{
              cursor: "pointer",
              position: "relative",
              aspectRatio: "16/9",
              backgroundColor: "#000",
            }}
            onMouseEnter={(e) => {
              const overlay = e.currentTarget.querySelector(".play-overlay") as HTMLElement;
              if (overlay) overlay.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              const overlay = e.currentTarget.querySelector(".play-overlay") as HTMLElement;
              if (overlay) overlay.style.opacity = "0.8";
            }}
          >
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt="Превью видео"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onError={(e) => {
                  console.error("[VideoPlayerSection] Ошибка загрузки thumbnail:", e);
                }}
              />
            ) : (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PlayArrowIcon sx={{ fontSize: 64, color: "white", opacity: 0.7 }} />
              </Box>
            )}
            {/* Оверлей с кнопкой Play - всегда видна с opacity 0.8, при hover - 1 */}
            <Box
              className="play-overlay"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0, 0, 0, 0.3)",
                opacity: 0.8, // Критично: всегда видна, не только при hover
                transition: "opacity 0.2s",
                pointerEvents: "none",
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 64, color: "white" }} />
            </Box>
            {/* Индикатор загрузки signed URL */}
            {isLoadingSignedUrl && (
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1,
                }}
              >
                <CircularProgress sx={{ color: "white" }} />
              </Box>
            )}
          </div>
        </div>
      );
    },
    [handleThumbnailClick, isLoadingSignedUrl],
  );

  // Внешние видео (YouTube/VK) - показываем iframe сразу
  if (videoMetadata?.isExternal || (videoInfo && !videoInfo.isCDN && !videoInfo.isHLS)) {
    if (!videoInfo) {
      return (
        <div className={styles.videoContainer}>
          <div style={{ padding: "20px", textAlign: "center" }}>
            <p>Загрузка видео...</p>
          </div>
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
          <CircularProgress />
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
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {videoMetadata.transcodingStatus === "PENDING"
              ? "Видео в очереди на обработку..."
              : "Видео обрабатывается..."}
          </Typography>
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

  // CDN видео COMPLETED - показываем thumbnail или плеер
  // Для офлайн видео (isOfflineVideo) всегда показываем thumbnail или плеер
  if (
    videoMetadata?.transcodingStatus === "COMPLETED" ||
    (!videoMetadata && videoInfo?.isHLS) ||
    isOfflineVideo
  ) {
    // Для офлайн видео используем Service Worker URL напрямую, для онлайн - signed URL
    const playbackUrl = isOfflineVideo ? videoUrl : signedUrl;

    // Определяем, какой thumbnail показывать как poster
    const thumbnailSrc =
      isOfflineVideo && offlineThumbnail && thumbnailBlobUrl
        ? thumbnailBlobUrl
        : videoMetadata?.thumbnailPath
          ? getCDNUrl(videoMetadata.thumbnailPath)
          : null;

    // Критично: Всегда показываем кастомную обложку пока !isPlaying или нет playbackUrl
    // Это гарантирует ленивую загрузку - видео не будет загружаться до клика пользователя
    if (!isPlaying || !playbackUrl) {
      return renderPosterWithPlayButton(thumbnailSrc);
    }

    // После клика на обложку и загрузки playbackUrl показываем плеер
    if (playbackUrl) {
      return (
        <div className={styles.videoContainer}>
          <div
            className={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
          >
            <HLSVideoPlayer
              src={playbackUrl}
              poster={thumbnailSrc || undefined}
              controls
              autoplay={false}
              className={styles.videoIframe}
              onError={(error) => {
                console.error("Video playback error:", error);
              }}
            />
          </div>
        </div>
      );
    }
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
