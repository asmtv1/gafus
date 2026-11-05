import { useEffect, useState } from "react";
import { PixelRatio } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NetInfoState } from "@react-native-community/netinfo";
import {
  mp4NetworkKey, recentMp4Performance, rememberMp4Startup,
  type Mp4Mode, type Mp4Quality, type Mp4NetworkHints,
} from "@gafus/chat-media-quality";

const STORAGE_KEY = "gafus:mp4-quality-mode:v1";
const validMode = (v: unknown): v is Mp4Mode => v === "auto" || v === 360 || v === 720;
let lastMode: Mp4Mode = "auto";
let modeLoaded = false;
let savedGeneration = 0;
let pendingWrite: Promise<unknown> = Promise.resolve();
let loading: Promise<Mp4Mode> | undefined;
export function loadNativeMp4Mode(): Promise<Mp4Mode> {
  if (modeLoaded) return Promise.resolve(lastMode);
  const generation = savedGeneration;
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then(raw => {
      const value: unknown = raw ? JSON.parse(raw) : "auto";
      if (generation === savedGeneration && validMode(value)) lastMode = value;
      modeLoaded = true;
      return lastMode;
    })
    .catch(() => { modeLoaded = true; return lastMode; });
  return loading;
}
export function saveNativeMp4Mode(mode: Mp4Mode): void {
  if (!validMode(mode)) return;
  lastMode = mode;
  modeLoaded = true;
  savedGeneration++;
  // Keep the final choice authoritative even if successive writes finish out of order.
  pendingWrite = pendingWrite.catch(() => undefined)
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mode)))
    .catch(() => undefined);
}
export function useNativeMp4Mode(): [Mp4Mode, (mode: Mp4Mode) => void] {
  const [mode, setMode] = useState<Mp4Mode>(lastMode);
  useEffect(() => {
    let active = true;
    void loadNativeMp4Mode().then(current => { if (active) setMode(current); });
    return () => { active = false; };
  }, []);
  return [mode, value => { setMode(value); saveNativeMp4Mode(value); }];
}

let network: Pick<Mp4NetworkHints, "connectionType" | "cellularGeneration" | "metered"> = {
  connectionType: "unknown",
};
export function updateNativeMp4Network(state: NetInfoState): void {
  network = {
    connectionType: state.type === "wifi" ? "wifi" :
      state.type === "ethernet" ? "ethernet" :
      state.type === "cellular" ? "cellular" : "unknown",
    cellularGeneration: state.type === "cellular" ? state.details.cellularGeneration ?? "unknown" : undefined,
    // OS metered flag is a cost signal; it doesn't imply a bandwidth estimate.
    metered: state.isConnected ? state.details?.isConnectionExpensive : undefined,
  };
}
export function nativeMp4Hints(width: number): Mp4NetworkHints {
  const hints: Mp4NetworkHints = { ...network, width, devicePixelRatio: PixelRatio.get() };
  return { ...hints, recentPerformance: recentMp4Performance(mp4NetworkKey(hints)) };
}
export function observeNativeMp4Start(hints: Mp4NetworkHints, quality: Mp4Quality, elapsedMs: number): void {
  rememberMp4Startup(mp4NetworkKey(hints), quality, elapsedMs);
}
