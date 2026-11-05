import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { VideoPlayer } from "expo-video";
import { mediaTime, safeVideoDuration, videoProgress, videoSeekForTouch } from "./socialVideoTimeline";

/**
 * One Instagram-style touch surface + draggable seek bar for progressive MP4.
 * Native controls are deliberately off: Android/iOS behave identically.
 * The parent owns play/pause (and therefore its existing first-play/URL logic).
 */
export function SocialVideoControls({ player, playing, onToggle, qualityControl, onExpand, label }: {
  player: VideoPlayer | null;
  playing: boolean;
  onToggle: () => void;
  qualityControl?: ReactNode;
  onExpand?: () => void;
  label?: string;
}) {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const width = useRef(0);
  const scrubbing = useRef(false);
  const latestScrub = useRef(0);

  useEffect(() => {
    if (!player) { setPosition(0); setDuration(0); return; }
    const previousInterval = player.timeUpdateEventInterval;
    player.timeUpdateEventInterval = 0.2;
    const sample = (seconds?: number) => {
      if (!scrubbing.current) setPosition(Number.isFinite(seconds) ? seconds! : player.currentTime);
      setDuration(safeVideoDuration(player.duration));
    };
    sample();
    const time = player.addListener("timeUpdate", event => sample(event.currentTime));
    const status = player.addListener("statusChange", () => sample());
    return () => {
      time.remove(); status.remove();
      player.timeUpdateEventInterval = previousInterval;
    };
  }, [player]);

  const durationSeconds = duration || safeVideoDuration(player?.duration ?? 0);
  const shownTime = scrub ?? position;
  const progress = videoProgress(shownTime, durationSeconds);
  const seek = (x: number) => {
    const seconds = videoSeekForTouch(x, width.current, durationSeconds);
    latestScrub.current = seconds;
    setScrub(seconds);
  };
  const capture = (event: GestureResponderEvent) => {
    if (!player || !durationSeconds) return;
    event.stopPropagation();
    scrubbing.current = true;
    seek(event.nativeEvent.locationX);
  };
  const finish = (event?: GestureResponderEvent) => {
    if (!scrubbing.current) return;
    event?.stopPropagation();
    scrubbing.current = false;
    // Seek once when the finger lifts. Frequent native seeks during a drag
    // can freeze decoding on iOS and create unnecessary Range requests.
    if (player && durationSeconds) {
      player.currentTime = Math.min(durationSeconds, Math.max(0, latestScrub.current));
      setPosition(latestScrub.current);
    }
    setScrub(null);
  };

  return <View style={styles.overlay} pointerEvents="box-none">
    <Pressable style={styles.tapArea} accessibilityRole="button"
      accessibilityLabel={playing ? "Пауза" : "Продолжить видео"}
      accessibilityHint={label ? `${label}. Нажмите, чтобы ${playing ? "приостановить" : "воспроизвести"}` : undefined}
      onPress={event => { event.stopPropagation(); onToggle(); }}>
      {!playing && <View pointerEvents="none" style={styles.centerPlay}>
        <MaterialCommunityIcons name="play" size={35} color="#fff" />
      </View>}
    </Pressable>
    <View style={styles.footer}>
      <View style={styles.footerRow}>
        <Text style={styles.time}>{mediaTime(shownTime)}</Text>
        <Text style={styles.duration}>/ {mediaTime(durationSeconds)}</Text>
        <View style={styles.footerSpacer} />
        {qualityControl}
        {onExpand && <Pressable style={styles.smallAction} accessibilityRole="button"
          accessibilityLabel="Развернуть видео"
          onPress={event => { event.stopPropagation(); onExpand(); }}>
          <MaterialCommunityIcons name="fullscreen" size={20} color="#fff" />
        </Pressable>}
      </View>
      <View style={styles.seekTouch} accessibilityRole="adjustable"
        accessibilityLabel="Перемотка видео"
        accessibilityValue={{ min: 0, max: Math.floor(durationSeconds), now: Math.floor(shownTime) }}
        accessibilityActions={[{ name: "increment", label: "Вперёд на 10 секунд" },
          { name: "decrement", label: "Назад на 10 секунд" }]}
        onAccessibilityAction={event => {
          if (!player || !durationSeconds) return;
          const diff = event.nativeEvent.actionName === "increment" ? 10 : -10;
          const next = Math.max(0, Math.min(durationSeconds, player.currentTime + diff));
          player.currentTime = next;
          setPosition(next);
        }}
        onLayout={event => { width.current = event.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => Boolean(player && durationSeconds)}
        onMoveShouldSetResponder={() => Boolean(player && durationSeconds)}
        onResponderGrant={capture}
        onResponderMove={event => { if (scrubbing.current) seek(event.nativeEvent.locationX); }}
        onResponderRelease={finish}
        onResponderTerminate={finish}>
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.filled, { width: `${progress * 100}%` }]} />
        </View>
        {scrub !== null && <View pointerEvents="none" style={[styles.thumb, {
          left: `${progress * 100}%`,
        }]} />}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  tapArea: { ...StyleSheet.absoluteFillObject, bottom: 62,
    alignItems: "center", justifyContent: "center" },
  centerPlay: { width: 58, height: 58, borderRadius: 29,
    backgroundColor: "#00000079", alignItems: "center", justifyContent: "center" },
  footer: { paddingHorizontal: 9, paddingBottom: 2, paddingTop: 2,
    backgroundColor: "#00000091" },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 28 },
  footerSpacer: { flex: 1 },
  time: { color: "#fff", fontSize: 11, fontVariant: ["tabular-nums"] },
  duration: { color: "#ffffffa8", fontSize: 10, fontVariant: ["tabular-nums"] },
  seekTouch: { width: "100%", height: 29, justifyContent: "center" },
  track: { height: 3, borderRadius: 3, backgroundColor: "#ffffff66", overflow: "hidden" },
  filled: { height: 3, borderRadius: 3, backgroundColor: "#fff" },
  thumb: { position: "absolute", width: 12, height: 12,
    marginLeft: -6, borderRadius: 6, backgroundColor: "#fff" },
  smallAction: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
});
