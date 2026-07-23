import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, AppState, Modal, View, StyleSheet, Pressable } from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoSource } from "expo-video";
import { Image } from "expo-image";
import { useNavigation } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { IconButton, Text } from "react-native-paper";

import { COLORS, SPACING } from "@/shared/config";
import { reportClientError } from "@/shared/lib/tracer";
import {
  canLoadHlsQualityVariants,
  parseHlsQualityVariants,
  type HlsQualityVariant,
} from "@/shared/lib/hlsQuality";
import {
  activateVideoPlayer,
  pauseVideoPlayerSafely,
  releaseVideoPlayer,
} from "@/shared/lib/videoPlaybackCoordinator";
import { getSafeVideoResumePosition } from "@gafus/core/utils";

/** Скорости воспроизведения для обучающих видео */
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
const DOUBLE_TAP_DELAY_MS = 400;
const SEEK_SECONDS = 10;
const PROGRESS_SAVE_INTERVAL_MS = 15_000;
const AUTO_QUALITY_ID = "auto";

interface PendingQualitySwitch {
  targetUri: string;
  positionSec: number;
  shouldResume: boolean;
}

interface VideoPlayerProps {
  uri: string;
  poster?: string;
  onComplete?: () => void;
  onRetry?: () => void;
  autoPlay?: boolean;
  initialTimeSec?: number;
  onSaveProgress?: (positionSec: number) => void;
  /** По умолчанию true. При true жесты на обёртке отключены — иначе тап после системной паузы снова вызывает play(). */
  nativeControls?: boolean;
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
export function VideoPlayer({
  uri,
  poster,
  onComplete,
  onRetry,
  autoPlay = false,
  nativeControls = true,
  initialTimeSec,
  onSaveProgress,
}: VideoPlayerProps) {
  const navigation = useNavigation();
  const videoViewRef = useRef<VideoView>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [hasRenderedFirstFrame, setHasRenderedFirstFrame] = useState(false);
  const [qualityVariants, setQualityVariants] = useState<HlsQualityVariant[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState(AUTO_QUALITY_ID);
  const [isQualityMenuVisible, setIsQualityMenuVisible] = useState(false);
  const [isQualitySwitching, setIsQualitySwitching] = useState(false);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoAreaWidthRef = useRef(0);
  const currentPositionRef = useRef(0);
  const lastSavedPositionRef = useRef<number | null>(null);
  const lastSaveTimeRef = useRef(0);
  const hasAppliedInitialPositionRef = useRef(false);
  const hasAutoPlayedRef = useRef(false);
  const onSaveProgressRef = useRef(onSaveProgress);
  const onCompleteRef = useRef(onComplete);
  const hasEndedRef = useRef(false);
  const isFullscreenRef = useRef(false);
  const pendingQualitySwitchRef = useRef<PendingQualitySwitch | null>(null);

  const source = useMemo(() => getVideoSource(uri), [uri]);

  useEffect(() => {
    if (!canLoadHlsQualityVariants(uri)) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(uri, {
          signal: controller.signal,
          headers: { Accept: "application/vnd.apple.mpegurl" },
        });
        if (!response.ok) throw new Error(`Не удалось загрузить HLS manifest: ${response.status}`);

        const manifest = await response.text();
        const variants = parseHlsQualityVariants(manifest, uri);
        if (!controller.signal.aborted) setQualityVariants(variants);
      } catch (error) {
        if (controller.signal.aborted) return;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          severity: "warning",
          issueKey: "VideoPlayer",
          keys: { operation: "load_quality_variants" },
        });
      }
    })();

    return () => controller.abort();
  }, [uri]);

  useEffect(() => {
    setHasRenderedFirstFrame(false);
    setPositionSec(0);
    setDurationSec(0);
    setBufferedSec(0);
    currentPositionRef.current = 0;
    lastSavedPositionRef.current = null;
    lastSaveTimeRef.current = 0;
    hasAppliedInitialPositionRef.current = false;
    hasAutoPlayedRef.current = false;
    hasEndedRef.current = false;
    pendingQualitySwitchRef.current = null;
    setQualityVariants([]);
    setSelectedQualityId(AUTO_QUALITY_ID);
    setIsQualityMenuVisible(false);
    setIsQualitySwitching(false);
  }, [uri]);

  useEffect(() => {
    onSaveProgressRef.current = onSaveProgress;
  }, [onSaveProgress]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 1;
    p.playbackRate = PLAYBACK_SPEEDS[0];
    p.pause();
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEventListener(
    player,
    "statusChange",
    (payload: { status?: string; error?: { message?: string } }) => {
      if (payload.status === "error" && payload.error?.message) {
        pendingQualitySwitchRef.current = null;
        setIsQualitySwitching(false);
        reportClientError(new Error(payload.error.message), {
          issueKey: "VideoPlayer",
          keys: { operation: "playback_error" },
        });
      }
    },
  );

  useEventListener(player, "playToEnd", () => {
    hasEndedRef.current = true;
    currentPositionRef.current = 0;
    lastSavedPositionRef.current = null;
    onSaveProgressRef.current?.(0);
    onCompleteRef.current?.();
  });

  useEventListener(player, "timeUpdate", (payload: { bufferedPosition?: number }) => {
    const currentTime = Math.max(0, player.currentTime || 0);
    currentPositionRef.current = currentTime;
    if (!nativeControls) {
      setPositionSec(currentTime);
      if (player.duration > 0 && durationSec !== player.duration) {
        setDurationSec(player.duration);
      }
      const buf = payload?.bufferedPosition ?? player.bufferedPosition;
      if (typeof buf === "number" && buf >= 0) {
        setBufferedSec(buf);
      }
    }
    const now = Date.now();
    const roundedPosition = Math.floor(currentTime);
    if (
      roundedPosition >= 5 &&
      now - lastSaveTimeRef.current >= PROGRESS_SAVE_INTERVAL_MS &&
      lastSavedPositionRef.current !== roundedPosition
    ) {
      lastSaveTimeRef.current = now;
      lastSavedPositionRef.current = roundedPosition;
      onSaveProgressRef.current?.(roundedPosition);
    }
  });

  useEventListener(player, "sourceLoad", (e) => {
    if (!nativeControls && e.duration > 0) setDurationSec(e.duration);

    const pendingSwitch = pendingQualitySwitchRef.current;
    if (!pendingSwitch) return;
    const loadedUri =
      typeof e.videoSource === "string"
        ? e.videoSource
        : typeof e.videoSource === "object" && e.videoSource !== null
          ? (e.videoSource.uri ?? null)
          : null;
    if (loadedUri !== pendingSwitch.targetUri) return;

    pendingQualitySwitchRef.current = null;
    const maxPosition = e.duration > 0 ? Math.max(0, e.duration - 0.25) : pendingSwitch.positionSec;
    const resumePosition = Math.min(pendingSwitch.positionSec, maxPosition);
    player.currentTime = resumePosition;
    currentPositionRef.current = resumePosition;
    if (pendingSwitch.shouldResume) player.play();
    setIsQualitySwitching(false);
  });

  useEventListener(player, "playingChange", ({ isPlaying: nowPlaying }) => {
    if (nowPlaying) {
      hasEndedRef.current = false;
      activateVideoPlayer(player);
      return;
    }
    releaseVideoPlayer(player);
    const position = Math.max(0, Math.floor(currentPositionRef.current));
    if (position > 0 && lastSavedPositionRef.current !== position) {
      lastSavedPositionRef.current = position;
      onSaveProgressRef.current?.(position);
    }
  });

  const isLoaded = status === "readyToPlay";
  const hasError = status === "error";
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
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "VideoPlayer",
        keys: { operation: "fullscreen" },
      });
    }
  }, [isFullscreen]);

  const handleFullscreenEnter = useCallback(() => {
    isFullscreenRef.current = true;
    setIsFullscreen(true);
  }, []);

  const handleFullscreenExit = useCallback(() => {
    isFullscreenRef.current = false;
    setIsFullscreen(false);
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      (error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          severity: "warning",
          issueKey: "VideoPlayer",
          keys: { operation: "restore_portrait" },
        });
      },
    );
  }, []);

  useEffect(
    () => () => {
      if (isFullscreenRef.current) {
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
          (error) => {
            reportClientError(error instanceof Error ? error : new Error(String(error)), {
              severity: "warning",
              issueKey: "VideoPlayer",
              keys: { operation: "restore_portrait_on_unmount" },
            });
          },
        );
      }
    },
    [],
  );

  const handleProgressPress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (!isLoaded || durationSec <= 0 || progressBarWidth <= 0) return;
      const newSec = (e.nativeEvent.locationX / progressBarWidth) * durationSec;
      player.currentTime = Math.max(0, Math.min(newSec, durationSec));
      setPositionSec(player.currentTime);
    },
    [isLoaded, durationSec, progressBarWidth, player],
  );

  useEffect(() => {
    if (status === "readyToPlay" && player.duration > 0) {
      if (!nativeControls) setDurationSec(player.duration);
    }
  }, [nativeControls, player, status]);

  useEffect(() => {
    if (
      status !== "readyToPlay" ||
      initialTimeSec == null ||
      initialTimeSec <= 0 ||
      hasAppliedInitialPositionRef.current ||
      currentPositionRef.current > 2 ||
      player.duration <= 0
    ) {
      return;
    }
    const safePosition = getSafeVideoResumePosition(initialTimeSec, player.duration);
    if (safePosition != null) {
      player.currentTime = safePosition;
      currentPositionRef.current = safePosition;
      if (!nativeControls) setPositionSec(safePosition);
    }
    hasAppliedInitialPositionRef.current = true;
  }, [initialTimeSec, nativeControls, player, status]);

  useEffect(() => {
    if (
      !autoPlay ||
      status !== "readyToPlay" ||
      hasAutoPlayedRef.current ||
      (initialTimeSec != null && initialTimeSec > 0 && !hasAppliedInitialPositionRef.current)
    ) {
      return;
    }
    hasAutoPlayedRef.current = true;
    player.play();
  }, [autoPlay, initialTimeSec, player, status]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("blur", () => {
      pauseVideoPlayerSafely(player);
      releaseVideoPlayer(player);
    });
    return unsubscribe;
  }, [navigation, player]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        pauseVideoPlayerSafely(player);
        releaseVideoPlayer(player);
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    player.playbackRate = PLAYBACK_SPEEDS[speedIndex];
  }, [speedIndex, player]);

  useEffect(
    () => () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      releaseVideoPlayer(player);
      const position = Math.max(0, Math.floor(currentPositionRef.current));
      if (!hasEndedRef.current && position > 0 && lastSavedPositionRef.current !== position) {
        onSaveProgressRef.current?.(position);
      }
    },
    [player],
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((i) => (i + 1) % PLAYBACK_SPEEDS.length);
  }, []);

  const selectedQualityLabel = useMemo(
    () =>
      selectedQualityId === AUTO_QUALITY_ID
        ? "Авто"
        : (qualityVariants.find((variant) => variant.id === selectedQualityId)?.label ?? "Авто"),
    [qualityVariants, selectedQualityId],
  );

  const selectQuality = useCallback(
    async (qualityId: string) => {
      setIsQualityMenuVisible(false);
      if (qualityId === selectedQualityId || isQualitySwitching) return;

      const variant = qualityVariants.find((item) => item.id === qualityId);
      if (qualityId !== AUTO_QUALITY_ID && !variant) return;

      const previousQualityId = selectedQualityId;
      const targetUri = variant?.uri ?? uri;
      pendingQualitySwitchRef.current = {
        targetUri,
        positionSec: Math.max(0, player.currentTime || currentPositionRef.current),
        shouldResume: player.playing,
      };
      setSelectedQualityId(qualityId);
      setIsQualitySwitching(true);

      try {
        await player.replaceAsync(getVideoSource(targetUri));
      } catch (error) {
        pendingQualitySwitchRef.current = null;
        setSelectedQualityId(previousQualityId);
        setIsQualitySwitching(false);
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "VideoPlayer",
          keys: { operation: "switch_quality", quality: qualityId },
        });
      }
    },
    [isQualitySwitching, player, qualityVariants, selectedQualityId, uri],
  );

  /** Только при nativeControls=false: двойной тап seek / тап по паузе play — иначе конфликт с системными контролами. */
  const handleVideoTouchEnd = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      if (isFullscreen) return;
      const x = e.nativeEvent.locationX;
      const w = videoAreaWidthRef.current;
      const now = Date.now();
      const last = lastTapRef.current;

      if (last && now - last.time < DOUBLE_TAP_DELAY_MS && Math.abs(x - last.x) < 80) {
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
          singleTapTimeoutRef.current = null;
        }
        lastTapRef.current = null;
        if (w > 0) {
          if (x < w * 0.4) seek(-SEEK_SECONDS);
          else if (x > w * 0.6) seek(SEEK_SECONDS);
          else togglePlay();
        }
        return;
      }

      lastTapRef.current = { time: now, x };
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (!player.playing) {
        singleTapTimeoutRef.current = setTimeout(() => {
          singleTapTimeoutRef.current = null;
          togglePlay();
        }, DOUBLE_TAP_DELAY_MS);
      }
    },
    [isFullscreen, player.playing, seek, togglePlay],
  );

  const bufferedProgress = durationSec > 0 && bufferedSec >= 0 ? bufferedSec / durationSec : 0;

  return (
    <View style={styles.container}>
      <View
        style={styles.videoContainer}
        onLayout={
          nativeControls
            ? undefined
            : (e) => {
                videoAreaWidthRef.current = e.nativeEvent.layout.width;
              }
        }
        onTouchEnd={nativeControls ? undefined : handleVideoTouchEnd}
      >
        <View style={styles.videoWrapper}>
          <VideoView
            ref={videoViewRef}
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={nativeControls}
            fullscreenOptions={{ enable: true, orientation: "default" }}
            onFullscreenEnter={handleFullscreenEnter}
            onFullscreenExit={handleFullscreenExit}
            onFirstFrameRender={() => setHasRenderedFirstFrame(true)}
          />
          {poster && !hasRenderedFirstFrame && !hasError && (
            <Image
              source={{ uri: poster }}
              style={styles.poster}
              contentFit="contain"
              accessibilityLabel="Обложка видео"
              pointerEvents="none"
            />
          )}
          {hasError && (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText} selectable>
                Не удалось воспроизвести видео. Проверьте соединение и попробуйте ещё раз.
              </Text>
              {onRetry && (
                <Pressable
                  style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
                  onPress={onRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Повторить загрузку видео"
                >
                  <Text style={styles.retryText}>Повторить</Text>
                </Pressable>
              )}
            </View>
          )}
          {!nativeControls && !isPlaying && !hasError && (
            <View style={styles.playOverlay} pointerEvents="none">
              <IconButton icon="play" iconColor="#fff" size={64} style={styles.centerPlayButton} />
            </View>
          )}
        </View>
      </View>

      {!nativeControls && (
        <View style={styles.controlsPanel}>
          <View style={styles.progressContainer}>
            <Pressable
              style={styles.progressBar}
              onPress={handleProgressPress}
              accessibilityRole="adjustable"
              accessibilityLabel="Позиция видео"
            >
              <View
                style={styles.progressBarBackground}
                onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
              >
                {bufferedProgress > 0 && (
                  <View
                    style={[
                      styles.progressBuffered,
                      { width: `${Math.min(bufferedProgress, 1) * 100}%` },
                    ]}
                  />
                )}
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </Pressable>
          </View>
          <View style={styles.bottomRow}>
            <Text style={styles.timeText}>
              {formatTime(positionSec)} / {formatTime(durationSec)}
            </Text>
            <View style={styles.controlButtons}>
              <IconButton
                icon="rewind-10"
                iconColor={COLORS.text}
                size={24}
                onPress={() => seek(-SEEK_SECONDS)}
                accessibilityLabel="Назад на 10 секунд"
              />
              <IconButton
                icon={isPlaying ? "pause" : "play"}
                iconColor={COLORS.text}
                size={32}
                onPress={togglePlay}
                accessibilityLabel={isPlaying ? "Пауза" : "Воспроизвести"}
              />
              <IconButton
                icon="fast-forward-10"
                iconColor={COLORS.text}
                size={24}
                onPress={() => seek(SEEK_SECONDS)}
                accessibilityLabel="Вперёд на 10 секунд"
              />
              <Pressable
                onPress={cycleSpeed}
                style={styles.speedButton}
                accessibilityRole="button"
                accessibilityLabel={`Скорость воспроизведения ${PLAYBACK_SPEEDS[speedIndex]}`}
              >
                <Text style={styles.speedText}>{PLAYBACK_SPEEDS[speedIndex]}×</Text>
              </Pressable>
              <IconButton
                icon={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                iconColor={isLoaded ? COLORS.text : COLORS.textSecondary}
                size={24}
                onPress={toggleFullscreen}
                disabled={!isLoaded && !isFullscreen}
                accessibilityLabel={
                  isFullscreen ? "Выйти из полноэкранного режима" : "На весь экран"
                }
              />
            </View>
          </View>
        </View>
      )}

      {qualityVariants.length > 1 && (
        <View style={styles.qualitySelectorRow}>
          <Text style={styles.qualitySelectorTitle}>Качество видео</Text>
          <Pressable
            onPress={() => setIsQualityMenuVisible(true)}
            disabled={isQualitySwitching}
            style={({ pressed }) => [
              styles.qualitySelectorButton,
              pressed && styles.buttonPressed,
              isQualitySwitching && styles.qualitySelectorButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Выбрать качество видео. Сейчас ${selectedQualityLabel}`}
          >
            {isQualitySwitching && <ActivityIndicator size="small" color={COLORS.primary} />}
            <Text style={styles.qualitySelectorValue}>{selectedQualityLabel}</Text>
            <Text style={styles.qualitySelectorChevron}>⌄</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={isQualityMenuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setIsQualityMenuVisible(false)}
      >
        <View style={styles.qualityModalRoot}>
          <Pressable
            style={styles.qualityModalBackdrop}
            onPress={() => setIsQualityMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Закрыть выбор качества"
          />
          <View style={styles.qualitySheet} accessibilityViewIsModal>
            <Text style={styles.qualitySheetTitle}>Качество видео</Text>
            <Text style={styles.qualitySheetHint}>
              В режиме «Авто» качество меняется под скорость интернета.
            </Text>
            <Pressable
              onPress={() => void selectQuality(AUTO_QUALITY_ID)}
              style={({ pressed }) => [styles.qualityOption, pressed && styles.buttonPressed]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedQualityId === AUTO_QUALITY_ID }}
            >
              <Text style={styles.qualityOptionText}>Авто</Text>
              {selectedQualityId === AUTO_QUALITY_ID && (
                <Text style={styles.qualityOptionCheck}>✓</Text>
              )}
            </Pressable>
            {qualityVariants.map((variant) => {
              const isSelected = selectedQualityId === variant.id;
              return (
                <Pressable
                  key={variant.id}
                  onPress={() => void selectQuality(variant.id)}
                  style={({ pressed }) => [styles.qualityOption, pressed && styles.buttonPressed]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={styles.qualityOptionText}>{variant.label}</Text>
                  {isSelected && <Text style={styles.qualityOptionCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
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
  poster: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
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
  retryButton: {
    marginTop: 12,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
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
    position: "relative",
  },
  progressBuffered: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 2,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  speedButton: {
    paddingHorizontal: SPACING.xs,
    justifyContent: "center",
    minWidth: 36,
  },
  speedText: {
    color: COLORS.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
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
  qualitySelectorRow: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  qualitySelectorTitle: {
    color: COLORS.text,
    fontSize: 14,
  },
  qualitySelectorButton: {
    minWidth: 96,
    minHeight: 40,
    paddingHorizontal: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING.xs,
    borderRadius: 10,
    backgroundColor: "rgba(104, 101, 35, 0.1)",
  },
  qualitySelectorButtonDisabled: {
    opacity: 0.7,
  },
  qualitySelectorValue: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  qualitySelectorChevron: {
    color: COLORS.primary,
    fontSize: 18,
    lineHeight: 18,
    marginTop: -3,
  },
  qualityModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  qualityModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  qualitySheet: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 28,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#fff",
  },
  qualitySheetTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  qualitySheetHint: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  qualityOption: {
    minHeight: 52,
    paddingHorizontal: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
  },
  qualityOptionText: {
    color: COLORS.text,
    fontSize: 16,
  },
  qualityOptionCheck: {
    color: COLORS.primary,
    fontSize: 20,
    fontWeight: "700",
  },
});
