import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoSource } from "expo-video";
import { IconButton, ActivityIndicator, Text } from "react-native-paper";
import { COLORS, SPACING } from "@/constants";

interface VideoPlayerProps {
  uri: string;
  poster?: string;
  onComplete?: () => void;
  onRetry?: () => void;
  autoPlay?: boolean;
}

/**
 * Источник для expo-video: HLS manifest без .m3u8 в пути — явно задаём contentType: 'hls'
 */
function getVideoSource(uri: string): VideoSource {
  const isHls =
    uri.includes("/manifest") ||
    uri.includes(".m3u8") ||
    uri.includes("/hls/") ||
    (uri.includes("/video/") && uri.includes("manifest"));

  if (isHls) {
    return { uri, contentType: "hls" };
  }
  return uri;
}

/**
 * Видео плеер на базе expo-video (HLS через contentType: 'hls')
 */
export function VideoPlayer({ uri, poster, onComplete, onRetry, autoPlay = false }: VideoPlayerProps) {
  const videoViewRef = useRef<VideoView>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const source = useMemo(() => getVideoSource(uri), [uri]);

  useEffect(() => setPlaybackError(null), [uri]);

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 1;
    if (autoPlay) p.play();
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEventListener(player, "statusChange", (payload: { status?: string; error?: { message?: string } }) => {
    if (payload.status === "error" && payload.error?.message) {
      setPlaybackError(payload.error.message);
      if (__DEV__) {
        console.warn("[VideoPlayer] Ошибка воспроизведения:", payload.error.message, { uri: uri?.slice(0, 80) });
      }
    } else {
      setPlaybackError(null);
    }
  });

  useEventListener(player, "playToEnd", () => {
    onComplete?.();
  });

  useEventListener(player, "timeUpdate", () => {
    setPositionSec(player.currentTime);
    if (player.duration > 0 && durationSec !== player.duration) {
      setDurationSec(player.duration);
    }
  });

  useEventListener(player, "sourceLoad", (e) => {
    if (e.duration > 0) setDurationSec(e.duration);
  });

  const isLoaded = status === "readyToPlay";
  const hasError = status === "error";
  const isBuffering = status === "loading";
  const progress = durationSec > 0 ? positionSec / durationSec : 0;

  const formatTime = useCallback((sec: number): string => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, "0")}`;
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) player.pause();
    else player.play();
  }, [isPlaying, player]);

  const seek = useCallback(
    (seconds: number) => {
      if (!isLoaded) return;
      player.seekBy(seconds);
    },
    [isLoaded, player],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (isFullscreen) {
        await videoViewRef.current?.exitFullscreen();
      } else {
        await videoViewRef.current?.enterFullscreen();
      }
    } catch {
      // игнорируем ошибки fullscreen
    }
  }, [isFullscreen]);

  const handleProgressPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (!isLoaded || durationSec <= 0 || progressBarWidth <= 0) return;
      const newSec = (e.nativeEvent.locationX / progressBarWidth) * durationSec;
      player.currentTime = Math.max(0, Math.min(newSec, durationSec));
      setPositionSec(player.currentTime);
    },
    [isLoaded, durationSec, progressBarWidth, player],
  );

  // Синхронизация duration из плеера при смене статуса
  useEffect(() => {
    if (status === "readyToPlay" && player.duration > 0) {
      setDurationSec(player.duration);
    }
  }, [status, player.duration]);

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <Pressable onPress={togglePlay} style={styles.videoWrapper}>
          <VideoView
            ref={videoViewRef}
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={false}
            fullscreenOptions={{ enable: true }}
            onFullscreenEnter={() => setIsFullscreen(true)}
            onFullscreenExit={() => setIsFullscreen(false)}
          />
          {hasError && (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText}>
                Ошибка загрузки видео
                {playbackError ? `\n${playbackError}` : ""}
              </Text>
              {onRetry && (
                <View style={styles.retryRow}>
                  <IconButton
                    icon="refresh"
                    iconColor="#fff"
                    size={32}
                    onPress={onRetry}
                  />
                  <Text style={styles.retryText}>Повторить</Text>
                </View>
              )}
            </View>
          )}
          {isBuffering && !hasError && (
            <View style={styles.bufferingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {!isPlaying && !hasError && (
            <Pressable style={styles.playOverlay} onPress={togglePlay}>
              <IconButton icon="play" iconColor="#fff" size={64} style={styles.centerPlayButton} />
            </Pressable>
          )}
        </Pressable>
      </View>

      <View style={styles.controlsPanel}>
        <View style={styles.progressContainer}>
          <Pressable style={styles.progressBar} onPress={handleProgressPress}>
            <View
              style={styles.progressBarBackground}
              onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
            >
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </Pressable>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.timeText}>
            {formatTime(positionSec)} / {formatTime(durationSec)}
          </Text>
          <View style={styles.controlButtons}>
            <IconButton icon="rewind-10" iconColor={COLORS.text} size={24} onPress={() => seek(-10)} />
            <IconButton
              icon={isPlaying ? "pause" : "play"}
              iconColor={COLORS.text}
              size={32}
              onPress={togglePlay}
            />
            <IconButton icon="fast-forward-10" iconColor={COLORS.text} size={24} onPress={() => seek(10)} />
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
    width: "100%",
    height: "100%",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  errorText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
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
