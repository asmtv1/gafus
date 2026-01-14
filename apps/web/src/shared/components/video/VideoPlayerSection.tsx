"use client";

import { useState, useEffect } from "react";
import { Box, CircularProgress, Alert, Typography } from "@/utils/muiImports";
import { PlayArrowIcon } from "@/utils/muiImports";
import { HLSVideoPlayer } from "./HLSVideoPlayer";
import { getCDNUrl } from "@gafus/cdn-upload";
import { getVideoMetadata } from "@shared/lib/video/getVideoMetadata";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";
import { getSignedVideoUrl } from "@shared/lib/video/getSignedVideoUrl";
import type { VideoMetadata } from "@shared/lib/video/getVideoMetadata";
import styles from "@/features/training/components/AccordionStep.module.css";

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
export function VideoPlayerSection({ videoUrl, videoInfo }: VideoPlayerSectionProps) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Загружаем метаданные видео при монтировании
  useEffect(() => {
    if (!videoUrl) {
      return;
    }

    setIsLoadingMetadata(true);
    getVideoMetadata(videoUrl)
      .then((metadata) => {
        setVideoMetadata(metadata);
      })
      .catch((error) => {
        console.error("[VideoPlayerSection] Ошибка получения метаданных:", error);
      })
      .finally(() => {
        setIsLoadingMetadata(false);
      });
  }, [videoUrl]);

  // Загружаем signed URL только при клике на превью
  const handleThumbnailClick = async () => {
    if (!videoUrl) {
      return;
    }

    if (signedUrl) {
      setShowPlayer(true);
      return;
    }

    setIsLoading(true);
    try {
      let url: string | null = null;

      // Если есть videoId в метаданных, используем его для получения signed URL
      if (videoMetadata?.videoId) {
        url = await getSignedVideoUrl(videoMetadata.videoId);
      }

      // Если не получили через videoId, используем getVideoUrlForPlayback
      if (!url) {
        url = await getVideoUrlForPlayback(videoUrl);
      }

      if (url) {
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
  };

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
  if (videoMetadata?.transcodingStatus === "COMPLETED" || (!videoMetadata && videoInfo?.isHLS)) {
    // Если плеер активен и есть signed URL - показываем плеер
    if (showPlayer && signedUrl) {
      return (
        <div className={styles.videoContainer}>
          <div className={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}>
            <HLSVideoPlayer
              src={signedUrl}
              controls
              autoplay={true}
              className={styles.videoIframe}
              onError={(error) => {
                console.error("Video playback error:", error);
              }}
            />
          </div>
        </div>
      );
    }

    // Если есть thumbnail - показываем превью
    if (videoMetadata?.thumbnailPath) {
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
              if (overlay) overlay.style.opacity = "0";
            }}
          >
            <img
              src={getCDNUrl(videoMetadata.thumbnailPath)}
              alt="Превью видео"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
              onError={(e) => {
                console.error("[VideoPlayerSection] Ошибка загрузки thumbnail:", {
                  thumbnailPath: videoMetadata.thumbnailPath,
                  url: videoMetadata.thumbnailPath ? getCDNUrl(videoMetadata.thumbnailPath) : null,
                  error: e,
                });
              }}
            />
            {/* Оверлей с кнопкой Play */}
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
            {/* Индикатор загрузки */}
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
                <CircularProgress sx={{ color: "white" }} />
              </Box>
            )}
          </div>
        </div>
      );
    }

    // Fallback для старых видео без thumbnail
    if (!videoMetadata?.thumbnailPath && videoMetadata?.videoId) {
      return (
        <div className={styles.videoContainer}>
          <div className={styles.videoWrapper} style={{ minHeight: "200px", padding: "20px" }}>
            <Alert severity="warning" sx={{ width: "100%" }}>
              Превью недоступно для этого видео
            </Alert>
          </div>
        </div>
      );
    }
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
