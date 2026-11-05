import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  countdownRemainingSeconds,
  walkDistanceMeters,
  formatWalkDistance,
  formatWalkDuration,
  isWalkRunning,
  normalizeWalk,
  walkDurationSeconds,
  walkElapsedMs,
  type DogWalk,
  type WalkTimerMode,
} from "./walkModel";

export interface WalkWidgetSnapshot {
  active: boolean;
  running: boolean;
  mode: WalkTimerMode;
  /** Date at which the stopwatch's current elapsed display would be 00:00. */
  displayStartMs: number;
  /** iOS native countdown target date; pausing must stop the dynamic timer. */
  displayEndMs: number;
  elapsedLabel: string;
  stepsLabel: string;
  metersLabel: string;
  incomplete: boolean;
  gpsEnabled?: boolean;
}
const KEY = "gafus:dog-walk:widget:snapshot:v2";

export function buildWalkWidgetSnapshot(
  walk: DogWalk | null,
  nowMs: number,
  preference: WalkTimerMode = "stopwatch",
): WalkWidgetSnapshot {
  const state = walk ? normalizeWalk(walk) : null;
  const elapsedMs = state ? walkElapsedMs(state, nowMs) : 0;
  const running = isWalkRunning(state);
  const mode = state?.mode ?? preference;
  return {
    active: state?.finishedAtMs === null && state !== null,
    running,
    mode,
    displayStartMs: nowMs - elapsedMs,
    displayEndMs: nowMs + (state ? countdownRemainingSeconds(state, nowMs) * 1000 : 0),
    elapsedLabel: state
      ? formatWalkDuration(
          mode === "countdown"
            ? countdownRemainingSeconds(state, nowMs)
            : walkDurationSeconds(state, nowMs),
        )
      : "00:00",
    stepsLabel: (state?.steps ?? 0).toLocaleString("ru-RU"),
    metersLabel: formatWalkDistance(state ? walkDistanceMeters(state) : 0),
    incomplete: state?.incompleteSteps ?? false,
    gpsEnabled: state?.gpsEnabled === true,
  };
}

export async function loadWalkWidgetSnapshot(): Promise<WalkWidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Partial<WalkWidgetSnapshot>) : null;
    if (
      data &&
      typeof data.active === "boolean" &&
      typeof data.running === "boolean" &&
      (data.mode === "stopwatch" || data.mode === "countdown") &&
      typeof data.elapsedLabel === "string" &&
      typeof data.stepsLabel === "string" &&
      typeof data.metersLabel === "string" &&
      typeof data.incomplete === "boolean" &&
      typeof data.displayStartMs === "number" &&
      typeof data.displayEndMs === "number"
    ) {
      return data as WalkWidgetSnapshot;
    }
  } catch {
    /* Return safe empty state for corrupt snapshot. */
  }
  return buildWalkWidgetSnapshot(null, Date.now());
}

export async function publishWalkWidgetSnapshot(
  walk: DogWalk | null,
  nowMs: number,
  preference: WalkTimerMode = "stopwatch",
): Promise<void> {
  const snapshot = buildWalkWidgetSnapshot(walk, nowMs, preference);
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  if (Platform.OS === "ios") {
    const { default: widget } = await import("./widgets/DogWalk.ios");
    widget.updateSnapshot(snapshot);
  } else if (Platform.OS === "android") {
    const { updateAndroidWalkWidgets } = await import("./widgets/androidWalkWidgets");
    await updateAndroidWalkWidgets(snapshot);
  }
}
