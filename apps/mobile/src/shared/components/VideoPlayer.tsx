import { useRef, useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { IconButton, ActivityIndicator, Text } from "react-native-paper";
import * as ScreenOrientation from "expo-screen-orientation";
import { COLORS, SPACING } from "@/constants";

interface VideoPlayerProps {
  uri: string;
  poster?: string;
  onComplete?: () => void;
  autoPlay?: boolean;
}

/**
 * Видео плеер на базе expo-av
 * Поддерживает fullscreen, управление воспроизведением
 */
export function VideoPlayer({ uri, poster, onComplete, autoPlay = false }: VideoPlayerProps) {
  if (__DEV__) {
    console.log("[VideoPlayer] Инициализация:", { uri, hasPoster: !!poster, autoPlay });
  }

  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

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

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsFullscreen(false);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

  // Seek forward/backward
  const seek = useCallback(async (seconds: number) => {
    if (!videoRef.current || !isLoaded) return;
    const newPosition = Math.max(0, Math.min(position + seconds * 1000, duration));
    await videoRef.current.setPositionAsync(newPosition);
  }, [isLoaded, position, duration]);

  // Handle playback status update
  const handlePlaybackStatusUpdate = useCallback((newStatus: AVPlaybackStatus) => {
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
  }, [onComplete]);

  // Toggle controls visibility
  const handlePressVideo = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  if (__DEV__) {
    console.log("[VideoPlayer] Рендеринг:", { 
      uri, 
      isLoaded, 
      isPlaying, 
      isBuffering,
      hasError: status?.isLoaded && status.error 
    });
  }

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreen]}>
      <Pressable onPress={handlePressVideo} style={styles.videoWrapper}>
        <Video
          ref={videoRef}
          source={{ uri }}
          posterSource={poster ? { uri: poster } : undefined}
          usePoster={!!poster}
          posterStyle={styles.poster}
          resizeMode={ResizeMode.CONTAIN}
          style={styles.video}
          shouldPlay={autoPlay}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onError={(error) => {
            if (__DEV__) {
              console.error("[VideoPlayer] Ошибка видео:", error);
            }
          }}
        />

        {/* Buffering indicator */}
        {isBuffering && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* Controls overlay */}
        {showControls && (
          <View style={styles.controlsOverlay}>
            {/* Center controls */}
            <View style={styles.centerControls}>
              <IconButton
                icon="rewind-10"
                iconColor="#fff"
                size={32}
                onPress={() => seek(-10)}
              />
              <IconButton
                icon={isPlaying ? "pause" : "play"}
                iconColor="#fff"
                size={56}
                onPress={togglePlay}
                style={styles.playButton}
              />
              <IconButton
                icon="fast-forward-10"
                iconColor="#fff"
                size={32}
                onPress={() => seek(10)}
              />
            </View>

            {/* Bottom controls */}
            <View style={styles.bottomControls}>
              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
              </View>

              {/* Time and fullscreen */}
              <View style={styles.bottomRow}>
                <Text style={styles.timeText}>
                  {formatTime(position)} / {formatTime(duration)}
                </Text>
                <IconButton
                  icon={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                  iconColor="#fff"
                  size={24}
                  onPress={toggleFullscreen}
                />
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },
  fullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    borderRadius: 0,
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
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
  },
  centerControls: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    marginHorizontal: SPACING.lg,
  },
  bottomControls: {
    padding: SPACING.sm,
  },
  progressContainer: {
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
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
    color: "#fff",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
