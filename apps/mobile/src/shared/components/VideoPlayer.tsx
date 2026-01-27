import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { IconButton, ActivityIndicator, Text } from "react-native-paper";
import { COLORS, SPACING } from "@/constants";

interface VideoPlayerProps {
  uri: string;
  poster?: string;
  onComplete?: () => void;
  autoPlay?: boolean;
}

/** HLS/manifest URL без .m3u8 в пути — на Android нужен overrideFileExtensionAndroid */
function getVideoSource(uri: string): { uri: string; overrideFileExtensionAndroid?: string } {
  const isHls =
    uri.includes("/manifest") ||
    uri.includes(".m3u8") ||
    uri.includes("/hls/");
  return isHls ? { uri, overrideFileExtensionAndroid: "m3u8" } : { uri };
}

/**
 * Видео плеер на базе expo-av
 * Поддерживает fullscreen, HLS (manifest), управление воспроизведением
 */
export function VideoPlayer({ uri, poster, onComplete, autoPlay = false }: VideoPlayerProps) {
  if (__DEV__) {
    console.log("[VideoPlayer] Инициализация:", { uri: uri?.slice(0, 60), hasPoster: !!poster, autoPlay });
  }

  const videoRef = useRef<Video>(null);
  const source = useMemo(() => getVideoSource(uri), [uri]);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Явная загрузка через loadAsync: для HLS/manifest expo-av иногда не переходит в isLoaded
  // при одной только передаче source. downloadAsync: false — обход багов на iOS 16.6+.
  useEffect(() => {
    if (!uri?.trim()) return;
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const doLoad = () => {
      const v = videoRef.current;
      if (!v) return;
      v.loadAsync(source, { progressUpdateIntervalMillis: 1000 }, false)
        .then((nextStatus) => {
          if (!cancelled) setStatus(nextStatus);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "Operation Stopped") {
            // Прерывание при размонтировании/remount — один повтор после паузы
            retryTimeout = setTimeout(doLoad, 200);
            return;
          }
          if (__DEV__ && !String(msg).includes("already loaded")) {
            console.warn("[VideoPlayer] loadAsync:", msg);
          }
        });
    };

    doLoad();
    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [uri, source]);

  const isLoaded = status?.isLoaded;
  const isPlaying = isLoaded && status.isPlaying;
  const isBuffering = isLoaded && status.isBuffering;
  const duration = isLoaded ? status.durationMillis || 0 : 0;
  const position = isLoaded ? status.positionMillis || 0 : 0;
  const progress = duration > 0 ? position / duration : 0;

  // Форматирование времени
  const formatTime = (millis: number): string => {
    const totalSec = Math.floor(millis / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying]);

  // Toggle fullscreen используя встроенный API expo-av. Не вызывать до загрузки видео.
  const toggleFullscreen = useCallback(async () => {
    if (!videoRef.current) return;
    if (!isLoaded && !isFullscreen) {
      if (__DEV__) {
        console.warn("[VideoPlayer] Fullscreen недоступен: видео ещё не загружено");
      }
      return;
    }

    try {
      if (isFullscreen) {
        await videoRef.current.dismissFullscreenPlayer();
      } else {
        await videoRef.current.presentFullscreenPlayer();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (__DEV__ && !msg.includes("video is not loaded")) {
        console.error("[VideoPlayer] Ошибка переключения fullscreen:", error);
      }
    }
  }, [isFullscreen, isLoaded]);

  // Seek forward/backward
  const seek = useCallback(
    async (seconds: number) => {
      if (!videoRef.current || !isLoaded) return;
      const newPosition = Math.max(0, Math.min(position + seconds * 1000, duration));
      await videoRef.current.setPositionAsync(newPosition);
    },
    [isLoaded, position, duration],
  );

  // Handle playback status update
  const handlePlaybackStatusUpdate = useCallback(
    (newStatus: AVPlaybackStatus) => {
      try {
        setStatus(newStatus);

        if (newStatus.isLoaded && newStatus.didJustFinish) {
          if (__DEV__) {
            console.log("[VideoPlayer] Видео завершено");
          }
          onComplete?.();
        }

        if (newStatus.isLoaded && newStatus.error) {
          if (__DEV__) {
            console.error("[VideoPlayer] Ошибка воспроизведения:", newStatus.error);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.error("[VideoPlayer] Ошибка в handlePlaybackStatusUpdate:", error);
        }
      }
    },
    [onComplete],
  );

  // Handle fullscreen update
  const handleFullscreenUpdate = useCallback((data: { fullscreenUpdate: number }) => {
    const { fullscreenUpdate } = data;

    if (__DEV__) {
      console.log("[VideoPlayer] Fullscreen update:", fullscreenUpdate);
    }

    switch (fullscreenUpdate) {
      case Video.FULLSCREEN_UPDATE_PLAYER_DID_PRESENT:
        setIsFullscreen(true);
        break;
      case Video.FULLSCREEN_UPDATE_PLAYER_DID_DISMISS:
        setIsFullscreen(false);
        break;
      default:
        // Игнорируем другие события
        break;
    }
  }, []);

  // Handle video press - toggle play/pause
  const handlePressVideo = useCallback(() => {
    togglePlay();
  }, [togglePlay]);

  if (__DEV__) {
    console.log("[VideoPlayer] Рендеринг:", {
      uri,
      isLoaded,
      isPlaying,
      isBuffering,
      hasError: status?.isLoaded && status.error,
    });
  }

  return (
    <View style={styles.container}>
      {/* Video container */}
      <View style={styles.videoContainer}>
        <Pressable onPress={handlePressVideo} style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={undefined}
            posterSource={poster ? { uri: poster } : undefined}
            usePoster={!!poster}
            posterStyle={styles.poster}
            resizeMode={ResizeMode.CONTAIN}
            style={styles.video}
            shouldPlay={autoPlay}
            progressUpdateIntervalMillis={1000}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onFullscreenUpdate={handleFullscreenUpdate}
            onError={(error) => {
              if (__DEV__) {
                const msg = typeof error === "string" ? error : (error as Error)?.message ?? "";
                if (msg !== "Operation Stopped") {
                  console.error("[VideoPlayer] Ошибка видео:", error);
                }
              }
            }}
          />

          {/* Buffering indicator */}
          {isBuffering && (
            <View style={styles.bufferingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {/* Play button overlay (только когда видео не играет) */}
          {!isPlaying && (
            <Pressable style={styles.playOverlay} onPress={togglePlay}>
              <IconButton icon="play" iconColor="#fff" size={64} style={styles.centerPlayButton} />
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* Controls panel снизу видео - всегда видна */}
      <View style={styles.controlsPanel}>
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Pressable
            style={styles.progressBar}
            onPress={(e) => {
              if (!isLoaded || !videoRef.current || duration === 0 || progressBarWidth === 0)
                return;
              const { locationX } = e.nativeEvent;
              const newPosition = (locationX / progressBarWidth) * duration;
              videoRef.current.setPositionAsync(Math.max(0, Math.min(newPosition, duration)));
            }}
          >
            <View
              style={styles.progressBarBackground}
              onLayout={(e) => {
                const { width } = e.nativeEvent.layout;
                setProgressBarWidth(width);
              }}
            >
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </Pressable>
        </View>

        {/* Bottom row with controls */}
        <View style={styles.bottomRow}>
          {/* Time display */}
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>

          {/* Control buttons */}
          <View style={styles.controlButtons}>
            <IconButton
              icon="rewind-10"
              iconColor={COLORS.text}
              size={24}
              onPress={() => seek(-10)}
            />
            <IconButton
              icon={isPlaying ? "pause" : "play"}
              iconColor={COLORS.text}
              size={32}
              onPress={togglePlay}
            />
            <IconButton
              icon="fast-forward-10"
              iconColor={COLORS.text}
              size={24}
              onPress={() => seek(10)}
            />
            <IconButton
              icon={isFullscreen ? "fullscreen-exit" : "fullscreen"}
              iconColor={isLoaded ? COLORS.text : COLORS.textSecondary}
              size={24}
              onPress={toggleFullscreen}
              disabled={!isLoaded && !isFullscreen}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  videoContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
  },
  videoWrapper: {
    flex: 1,
  },
  video: {
    flex: 1,
  },
  poster: {
    resizeMode: "cover",
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  centerPlayButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  controlsPanel: {
    backgroundColor: "#fff",
    padding: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  progressContainer: {
    marginBottom: SPACING.xs,
  },
  progressBar: {
    width: "100%",
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    color: COLORS.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  controlButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
});
