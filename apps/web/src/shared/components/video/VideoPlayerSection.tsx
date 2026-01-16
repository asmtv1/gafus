"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, CircularProgress, Alert, Typography } from "@/utils/muiImports";
import { PlayArrowIcon } from "@/utils/muiImports";
import { HLSVideoPlayer } from "./HLSVideoPlayer";
import { getCDNUrl } from "@gafus/cdn-upload";
import { getVideoMetadata } from "@shared/lib/video/getVideoMetadata";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";
import { getSignedVideoUrl } from "@shared/lib/video/getSignedVideoUrl";
import { getOfflineCourseByType } from "@shared/lib/offline/offlineCourseStorage";
import type { VideoMetadata } from "@shared/lib/video/getVideoMetadata";
import styles from "@/features/training/components/AccordionStep.module.css";

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
export function VideoPlayerSection({ videoUrl, originalVideoUrl, courseType, videoInfo }: VideoPlayerSectionProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [offlineThumbnail, setOfflineThumbnail] = useState<Blob | null>(null);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string | null>(null);

  // Определяем, является ли videoUrl blob URL (офлайн видео)
  // Мемоизируем для предотвращения лишних ререндеров
  const isBlobUrl = useMemo(() => videoUrl?.startsWith("blob:") ?? false, [videoUrl]);
  // Используем originalVideoUrl для метаданных, если videoUrl это blob URL
  // Мемоизируем для предотвращения лишних ререндеров
  const urlForMetadata = useMemo(
    () => (isBlobUrl && originalVideoUrl) ? originalVideoUrl : videoUrl,
    [isBlobUrl, originalVideoUrl, videoUrl]
  );

  // Сброс showPlayer для офлайн видео при монтировании
  useEffect(() => {
    if (isBlobUrl) {
      setShowPlayer(false);
    }
  }, [isBlobUrl]);

  // Мемоизируем videoId для предотвращения лишних ререндеров
  const videoId = useMemo(() => videoMetadata?.videoId, [videoMetadata?.videoId]);

  // Загружаем thumbnail из IndexedDB для офлайн режима
  useEffect(() => {
    if (!isBlobUrl || !courseType || !videoUrl) {
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
  }, [isBlobUrl, courseType, videoUrl, originalVideoUrl, videoId]);

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

  // Загружаем signed URL только при клике на превью
  // Мемоизирован для предотвращения лишних ререндеров
  const handleThumbnailClick = useCallback(async () => {
    if (!videoUrl) {
      return;
    }

    // Для офлайн видео (blob URL) сразу показываем плеер
    if (isBlobUrl) {
      setShowPlayer(true);
      return;
    }

    // Для онлайн видео получаем signed URL
    if (signedUrl) {
      setShowPlayer(true);
      return;
    }

    setIsLoading(true);
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
        // React 18 автоматически батчит эти setState в один ререндер
        setSignedUrl(url);
        setShowPlayer(true);
      } else {
        console.error("[VideoPlayerSection] Не удалось получить signed URL");
      }
    } catch (error) {
      console.error("[VideoPlayerSection] Ошибка получения signed URL:", error);
    } finally {
      setIsLoading(false);
    }
  }, [videoUrl, isBlobUrl, signedUrl, videoId]);

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
        <div className={styles.videoWrapper} style={{ minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  // CDN видео в обработке (PENDING/PROCESSING)
  if (videoMetadata?.transcodingStatus === "PENDING" || videoMetadata?.transcodingStatus === "PROCESSING") {
    return (
      <div className={styles.videoContainer}>
        <div className={styles.videoWrapper} style={{ minHeight: "200px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px" }}>
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
  // Для офлайн видео (isBlobUrl) всегда показываем thumbnail или плеер
  if (
    videoMetadata?.transcodingStatus === "COMPLETED" || 
    (!videoMetadata && videoInfo?.isHLS) ||
    isBlobUrl
  ) {
    // Для офлайн видео используем blob URL напрямую, для онлайн - signed URL
    const playbackUrl = isBlobUrl ? videoUrl : signedUrl;
    const hasPlaybackUrl = !!playbackUrl;
    
    // Определяем, какой thumbnail показывать
    const thumbnailSrc = isBlobUrl && offlineThumbnail && thumbnailBlobUrl
      ? thumbnailBlobUrl
      : videoMetadata?.thumbnailPath
      ? getCDNUrl(videoMetadata.thumbnailPath)
      : null;
    
    const hasThumbnail = !!thumbnailSrc;
    // Thumbnail показывается когда плеер не активен ИЛИ идет загрузка
    const showThumbnail = !showPlayer || isLoading;
    // Thumbnail виден (opacity) когда плеер не активен ИЛИ идет загрузка
    const thumbnailVisible = !showPlayer || isLoading;
    
    return (
      <div className={styles.videoContainer}>
        <div
          className={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
          style={{
            position: "relative",
            aspectRatio: "16/9",
            backgroundColor: "#000",
            overflow: "hidden",
          }}
        >
          {/* Thumbnail - показывается когда плеер не активен или идет загрузка */}
          {showThumbnail && (
            <Box
              onClick={!showPlayer ? handleThumbnailClick : undefined}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                cursor: !showPlayer ? "pointer" : "default",
                opacity: thumbnailVisible ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
                pointerEvents: !showPlayer ? "auto" : "none",
                zIndex: thumbnailVisible ? 1 : 0,
              }}
              onMouseEnter={(e) => {
                if (!showPlayer) {
                  const overlay = e.currentTarget.querySelector(".play-overlay") as HTMLElement;
                  if (overlay) overlay.style.opacity = "1";
                }
              }}
              onMouseLeave={(e) => {
                if (!showPlayer) {
                  const overlay = e.currentTarget.querySelector(".play-overlay") as HTMLElement;
                  if (overlay) overlay.style.opacity = "0";
                }
              }}
            >
              {hasThumbnail ? (
                <img
                  src={thumbnailSrc!}
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
              {/* Оверлей с кнопкой Play */}
              {!showPlayer && (
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
                    opacity: 0,
                    transition: "opacity 0.2s",
                    pointerEvents: "none",
                  }}
                >
                  <PlayArrowIcon sx={{ fontSize: 64, color: "white" }} />
                </Box>
              )}
              {/* Индикатор загрузки */}
              {isLoading && (
                <Box
                  sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 2,
                  }}
                >
                  <CircularProgress sx={{ color: "white" }} />
                </Box>
              )}
            </Box>
          )}
          
          {/* Плеер - показывается когда активен и есть playbackUrl */}
          {showPlayer && hasPlaybackUrl && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: isLoading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
                zIndex: isLoading ? 0 : 2,
                pointerEvents: isLoading ? "none" : "auto",
              }}
            >
              <HLSVideoPlayer
                src={playbackUrl}
                controls
                autoplay={true}
                className={styles.videoIframe}
                onError={(error) => {
                  console.error("Video playback error:", error);
                }}
              />
            </Box>
          )}
        </div>
      </div>
    );
  }

  // Загрузка signed URL
  if (isLoading) {
    return (
      <div className={styles.videoContainer}>
        <div className={styles.videoWrapper} style={{ minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </div>
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
