/** Privacy-minimal analytics. One event for each MP4 rendition that begins playing. */
export type VideoPlaybackSurface = "moments" | "chat";
export type VideoPlaybackPlatform = "web" | "ios" | "android";
export type VideoPlaybackMode = "auto" | "manual";
export type VideoPlaybackNetworkClass = "wifi" | "ethernet" | "cellular" | "unknown";
export interface VideoPlaybackQualityEvent {
  /** Random UUID for idempotent delivery; unrelated to user/session/media IDs. */
  id: string;
  surface: VideoPlaybackSurface;
  platform: VideoPlaybackPlatform;
  quality: 360 | 720;
  mode: VideoPlaybackMode;
  available360: boolean;
  available720: boolean;
  networkClass: VideoPlaybackNetworkClass;
  saveData: boolean;
  fallback: boolean;
}
export interface VideoPlaybackQualityBreakdown {
  label: string;
  count360: number;
  count720: number;
  total: number;
}
export interface VideoPlaybackQualityReport {
  days: 7 | 30 | 90;
  from: string;
  through: string;
  total: number;
  count360: number;
  count720: number;
  percent360: number;
  auto360: number;
  manual360: number;
  only360: number;
  only720: number;
  fallbackStarts: number;
  savingData360: number;
  byDay: VideoPlaybackQualityBreakdown[];
  bySurface: VideoPlaybackQualityBreakdown[];
  byPlatform: VideoPlaybackQualityBreakdown[];
  byNetwork: VideoPlaybackQualityBreakdown[];
}
