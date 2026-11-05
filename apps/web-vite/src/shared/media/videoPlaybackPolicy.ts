import {
  mp4NetworkKey,
  recentMp4Performance,
  rememberMp4Startup,
  type Mp4Mode,
  type Mp4Quality,
  type Mp4NetworkHints,
} from "@gafus/chat-media-quality";

const STORAGE_KEY = "gafus:mp4-quality-mode:v1";
const validMode = (v: unknown): v is Mp4Mode => v === "auto" || v === 360 || v === 720;

export function savedWebMp4Mode(): Mp4Mode {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '"auto"');
    return validMode(value) ? value : "auto";
  } catch {
    return "auto";
  }
}
export function saveWebMp4Mode(mode: Mp4Mode): void {
  if (!validMode(mode)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mode));
  } catch {
    /* Browsers may disable storage; current player still obeys selection. */
  }
}

export function webMp4Hints(width: number, saveData = false): Mp4NetworkHints {
  const network = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        downlink?: number;
        effectiveType?: Mp4NetworkHints["effectiveType"];
        type?: string;
      };
    }
  ).connection;
  const connectionType =
    network?.type === "wifi"
      ? "wifi"
      : network?.type === "ethernet"
        ? "ethernet"
        : network?.type === "cellular"
          ? "cellular"
          : "unknown";
  const hints: Mp4NetworkHints = {
    width,
    devicePixelRatio: window.devicePixelRatio,
    saveData: saveData || network?.saveData,
    downlinkMbps: network?.downlink,
    effectiveType: network?.effectiveType,
    connectionType,
  };
  return { ...hints, recentPerformance: recentMp4Performance(mp4NetworkKey(hints)) };
}
export function observeWebMp4Start(
  hints: Mp4NetworkHints,
  quality: Mp4Quality,
  elapsedMs: number,
): void {
  rememberMp4Startup(mp4NetworkKey(hints), quality, elapsedMs);
}
