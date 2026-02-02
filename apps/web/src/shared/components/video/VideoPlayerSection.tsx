"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, CircularProgress, Alert, Typography } from "@shared/utils/muiImports";
import { PlayArrowIcon } from "@shared/utils/muiImports";
import dynamic from "next/dynamic";
import { getCDNUrl } from "@gafus/cdn-upload";
import { getVideoMetadata } from "@shared/lib/video/getVideoMetadata";
import { getVideoUrlForPlayback } from "@shared/lib/video/getVideoUrlForPlayback";
import { getSignedVideoUrl } from "@shared/lib/video/getSignedVideoUrl";
import { getOfflineCourseByType } from "@shared/lib/offline/offlineCourseStorage";
import { getVideoProgress, saveVideoProgress } from "@shared/lib/video/videoProgressActions";
import {
  getLocalVideoProgress,
  saveLocalVideoProgress,
} from "@shared/lib/video/videoProgressStorage";
import { useOfflineStore } from "@shared/stores/offlineStore";
import type { VideoMetadata } from "@shared/lib/video/getVideoMetadata";
import styles from "@/features/training/components/AccordionStep/AccordionStep.module.css";

// Динамический импорт HLSVideoPlayer (~250KB экономии начального bundle)
const HLSVideoPlayer = dynamic(
  () => import("./HLSVideoPlayer").then((mod) => ({ default: mod.HLSVideoPlayer })),
  {
    loading: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
        <CircularProgress />
      </div>
    ),
    ssr: false, // Плеер используется только на клиенте
  }
);

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
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [offlineThumbnail, setOfflineThumbnail] = useState<Blob | null>(null);
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string | null>(null);
  const [initialTimeSec, setInitialTimeSec] = useState<number | undefined>(undefined);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false); // Флаг для ленивой загрузки

  // Получаем статус онлайн/офлайн
  const isOnline = useOfflineStore((state) => state.isOnline);

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

  // Загружаем прогресс просмотра при наличии videoId (универсально: онлайн/офлайн)
  useEffect(() => {
    if (!videoId) {
      return;
    }

    // Выбираем источник в зависимости от статуса онлайн/офлайн
    const loadProgress = isOnline
      ? getVideoProgress(videoId)
      : getLocalVideoProgress(videoId).then((pos) => (pos ? { lastPositionSec: pos } : null));

    loadProgress
      .then((progress) => {
        if (progress && progress.lastPositionSec > 0) {
          setInitialTimeSec(progress.lastPositionSec);
        }
      })
      .catch((error) => {
        console.error("[VideoPlayerSection] Ошибка загрузки прогресса:", error);
      });
  }, [videoId, isOnline]);

  // Колбэк для сохранения позиции просмотра (универсально: онлайн/офлайн)
  const handleSaveProgress = useCallback(
    (positionSec: number) => {
      if (!videoId) {
        return;
      }

      // Выбираем метод сохранения в зависимости от статуса онлайн/офлайн
      const savePromise = isOnline
        ? saveVideoProgress(videoId, positionSec)
        : saveLocalVideoProgress(videoId, positionSec).then(() => ({ success: true }));

      savePromise.catch((error) => {
        console.error("[VideoPlayerSection] Ошибка сохранения прогресса:", error);
      });
    },
    [videoId, isOnline],
  );

  // Загружаем signed URL только когда пользователь кликнул на play (для CDN видео)
  useEffect(() => {
    // Пропускаем если нет videoUrl, это офлайн видео, signed URL уже загружен, или пользователь ещё не кликнул
    if (!videoUrl || isOfflineVideo || signedUrl || !shouldLoadVideo) {
      return;
    }

    async function loadSignedUrl() {
      try {
        // Запускаем обе операции параллельно (2x быстрее)
        const [urlFromVideoId, urlFromPlayback] = await Promise.all([
          videoId ? getSignedVideoUrl(videoId) : Promise.resolve(null),
          getVideoUrlForPlayback(videoUrl),
        ]);

        const url = urlFromVideoId || urlFromPlayback;

        if (url) {
          setSignedUrl(url);
        } else {
          console.error("[VideoPlayerSection] Не удалось получить signed URL");
        }
      } catch (error) {
        console.error("[VideoPlayerSection] Ошибка получения signed URL:", error);
      }
    }

    loadSignedUrl();
  }, [videoUrl, videoId, isOfflineVideo, signedUrl, shouldLoadVideo]);


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

    // Определяем, какой thumbnail показывать
    const thumbnailSrc =
      isOfflineVideo && offlineThumbnail && thumbnailBlobUrl
        ? thumbnailBlobUrl
        : videoMetadata?.thumbnailPath
          ? getCDNUrl(videoMetadata.thumbnailPath)
          : null;

    // Для офлайн видео сразу монтируем плеер (не экономим трафик т.к. уже локально)
    // Для онлайн видео сначала показываем кастомную обложку
    if (!isOfflineVideo && !shouldLoadVideo) {
      // Показываем кастомную обложку с кнопкой play (не загружаем видео)
      return (
        <div className={styles.videoContainer}>
          <div
            className={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
            style={{
              position: "relative",
              cursor: "pointer",
              backgroundColor: "#000",
            }}
            onClick={() => {
              setShouldLoadVideo(true);
            }}
          >
            {/* Thumbnail */}
            {thumbnailSrc && (
              <img
                src={thumbnailSrc}
                alt="Превью видео"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}
            {/* Кнопка Play поверх thumbnail */}
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                borderRadius: "50%",
                width: { xs: "60px", sm: "80px" },
                height: { xs: "60px", sm: "80px" },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.2s",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.85)",
                },
              }}
            >
              <PlayArrowIcon sx={{ fontSize: { xs: "40px", sm: "50px" }, color: "#fff" }} />
            </Box>
          </div>
        </div>
      );
    }

    // Пользователь кликнул или это офлайн видео - показываем плеер
    // Показываем loading пока загружается playbackUrl
    if (!playbackUrl) {
      return (
        <div className={styles.videoContainer}>
          <div
            className={styles.videoWrapper}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
            }}
          >
            <CircularProgress />
          </div>
        </div>
      );
    }

    // Показываем плеер (автоплей будет в HLSVideoPlayer после loadedmetadata)
    return (
      <div className={styles.videoContainer}>
        <div
          className={`${styles.videoWrapper} ${videoInfo?.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
        >
          <HLSVideoPlayer
            src={playbackUrl}
            poster={thumbnailSrc || undefined}
            controls
            className={styles.videoIframe}
            initialTimeSec={initialTimeSec}
            onSaveProgress={handleSaveProgress}
            onError={(error) => {
              console.error("Video playback error:", error);
            }}
          />
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
