import * as Crypto from "expo-crypto";
import { apiClient } from "@/shared/lib/api/client";
import type { VideoPlaybackQualityEvent, VideoPlaybackSurface } from "@gafus/types";
import type { Mp4NetworkHints } from "@gafus/chat-media-quality";
import { Platform } from "react-native";

type Playback = {
  surface: VideoPlaybackSurface;
  quality: 360 | 720;
  mode: "auto" | 360 | 720;
  available: {360?: string;720?: string} | undefined | null;
  hints: Mp4NetworkHints;
  fallback: boolean;
};

/** Fire-and-forget while active; UUID makes a retried delivery idempotent. */
export function reportNativeVideoStarted(playback: Playback): void {
  const available = playback.available;
  if (!available || !available[playback.quality]) return;
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  const event: VideoPlaybackQualityEvent = {
    id: Crypto.randomUUID(),
    surface: playback.surface,
    platform: Platform.OS,
    quality: playback.quality,
    mode: playback.mode === "auto" ? "auto" : "manual",
    available360: Boolean(available[360]),
    available720: Boolean(available[720]),
    networkClass: playback.hints.connectionType ?? "unknown",
    saveData: Boolean(playback.hints.saveData || playback.hints.metered),
    fallback: playback.fallback,
  };
  void apiClient("/api/v1/video-quality/start", {
    method: "POST", body: event, skipAuthRefreshReplay: true,
  }).catch(() => undefined);
}
