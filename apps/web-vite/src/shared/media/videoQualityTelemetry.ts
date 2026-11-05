import { apiRequest } from "../api/client";
import type {
  VideoPlaybackQualityEvent, VideoPlaybackSurface,
} from "@gafus/types";
import type { Mp4NetworkHints } from "@gafus/chat-media-quality";

type Playback = {
  surface: VideoPlaybackSurface;
  quality: 360 | 720;
  mode: "auto" | 360 | 720;
  available: {360?: string;720?: string} | undefined | null;
  hints: Mp4NetworkHints;
  fallback: boolean;
};

/** Send ONLY after the selected MP4 actually starts playing. Never block playback. */
export function reportWebVideoStarted(playback: Playback): void {
  const available = playback.available;
  if (!available || !available[playback.quality]) return;
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return;
  const event: VideoPlaybackQualityEvent = {
    id: window.crypto.randomUUID(),
    surface: playback.surface,
    platform: "web",
    quality: playback.quality,
    mode: playback.mode === "auto" ? "auto" : "manual",
    available360: Boolean(available[360]),
    available720: Boolean(available[720]),
    networkClass: playback.hints.connectionType ?? "unknown",
    saveData: Boolean(playback.hints.saveData || playback.hints.metered),
    fallback: playback.fallback,
  };
  void apiRequest("/api/v1/video-quality/start", {
    method: "POST", json: event, browserAuth: true,
  }).catch(() => undefined); // Analytics may not prevent a video from playing.
}
