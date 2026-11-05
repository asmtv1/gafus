/** Dog walk steps: physical pedometer samples, not course/training steps. */
export const DEFAULT_STRIDE_METERS = 0.8;
export const WALK_REMINDER_INTERVAL_SEC = 30 * 60;
export type WalkTimerMode = "stopwatch" | "countdown";

export interface DogWalk {
  /** Device-generated stable UUID for server deduplication and offline retries. */
  clientId?: string;
  startedAtMs: number;
  finishedAtMs: number | null;
  steps: number;
  /** Sensor absent, denied, or unable to account for time in background. */
  incompleteSteps: boolean;
  /** Null/undefined means no reliable GPS distance; use steps as approximate fallback. */
  gpsMeters?: number | null;
  gpsEnabled?: boolean;
  mode?: WalkTimerMode;
  /** Required for countdown; never implicitly ends the walk. */
  targetDurationSec?: number;
  /** Committed walking time, excluding all pauses. */
  elapsedBeforePauseMs?: number;
  /** Null when paused or finished. Legacy walks infer this from startedAtMs. */
  runningSinceMs?: number | null;
  /** Steps committed prior to the current walking segment, excluding pauses. */
  stepBaselineAtResume?: number;
}

export function normalizeWalk(walk: DogWalk): DogWalk {
  return {
    ...walk,
    mode: walk.mode === "countdown" ? "countdown" : "stopwatch",
    targetDurationSec:
      walk.mode === "countdown" && Number.isFinite(walk.targetDurationSec)
        ? Math.max(60, Math.floor(walk.targetDurationSec!))
        : undefined,
    elapsedBeforePauseMs: Number.isFinite(walk.elapsedBeforePauseMs)
      ? Math.max(0, walk.elapsedBeforePauseMs!)
      : walk.finishedAtMs !== null
        ? Math.max(0, walk.finishedAtMs - walk.startedAtMs)
        : 0,
    runningSinceMs:
      walk.runningSinceMs === undefined
        ? walk.finishedAtMs === null
          ? walk.startedAtMs
          : null
        : walk.runningSinceMs,
  };
}

export function isWalkRunning(walk: DogWalk | null): boolean {
  return Boolean(walk && walk.finishedAtMs === null && normalizeWalk(walk).runningSinceMs !== null);
}

export function walkElapsedMs(walk: DogWalk, nowMs: number): number {
  const state = normalizeWalk(walk);
  const committed = state.elapsedBeforePauseMs ?? 0;
  if (state.runningSinceMs !== null && state.finishedAtMs === null) {
    return Math.max(0, committed + Math.max(0, nowMs - state.runningSinceMs!));
  }
  if (walk.runningSinceMs === undefined && walk.finishedAtMs !== null) {
    // Migrate historical finished walks, which had no pause model.
    return Math.max(0, walk.finishedAtMs - walk.startedAtMs);
  }
  return Math.max(0, committed);
}

export function walkDurationSeconds(walk: DogWalk, nowMs: number): number {
  return Math.floor(walkElapsedMs(walk, nowMs) / 1000);
}

export function countdownRemainingSeconds(walk: DogWalk, nowMs: number): number {
  const state = normalizeWalk(walk);
  return state.mode === "countdown"
    ? Math.max(0, (state.targetDurationSec ?? 0) - walkDurationSeconds(state, nowMs))
    : 0;
}

export function startWalk(mode: WalkTimerMode, nowMs: number, targetDurationSec?: number): DogWalk {
  return {
    startedAtMs: nowMs,
    finishedAtMs: null,
    steps: 0,
    incompleteSteps: false,
    mode,
    targetDurationSec:
      mode === "countdown" ? Math.max(60, Math.floor(targetDurationSec ?? 1800)) : undefined,
    stepBaselineAtResume: 0,
    elapsedBeforePauseMs: 0,
    runningSinceMs: nowMs,
  };
}

export function pauseWalk(walk: DogWalk, nowMs: number): DogWalk {
  const state = normalizeWalk(walk);
  if (state.finishedAtMs !== null || state.runningSinceMs === null) return state;
  return { ...state, elapsedBeforePauseMs: walkElapsedMs(state, nowMs), runningSinceMs: null };
}

export function resumeWalk(walk: DogWalk, nowMs: number): DogWalk {
  const state = normalizeWalk(walk);
  if (state.finishedAtMs !== null || state.runningSinceMs !== null) return state;
  return { ...state, runningSinceMs: nowMs };
}

export function finishWalk(walk: DogWalk, nowMs: number): DogWalk {
  const state = normalizeWalk(walk);
  if (state.finishedAtMs !== null) return state;
  return {
    ...state,
    elapsedBeforePauseMs: walkElapsedMs(state, nowMs),
    runningSinceMs: null,
    finishedAtMs: nowMs,
  };
}

/** Time until the next 30-minute milestone, strictly in active walking time. */
export function secondsToNextWalkReminder(walk: DogWalk, nowMs: number): number {
  const elapsed = walkElapsedMs(walk, nowMs) / 1000;
  const remaining = WALK_REMINDER_INTERVAL_SEC - (elapsed % WALK_REMINDER_INTERVAL_SEC);
  return Math.max(1, Math.ceil(remaining));
}

export function estimatedWalkMeters(steps: number, strideMeters = DEFAULT_STRIDE_METERS): number {
  return Math.round(Math.max(0, Math.floor(steps)) * strideMeters);
}

export function formatWalkDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function walkDistanceMeters(walk: DogWalk): number {
  return walk.gpsMeters != null && Number.isFinite(walk.gpsMeters)
    ? Math.max(0, Math.round(walk.gpsMeters)) : estimatedWalkMeters(walk.steps);
}

export function formatWalkDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2).replace(/\.?0+$/, "")} км` : `${meters} м`;
}

export function totalTodayWalks(
  history: DogWalk[],
  nowMs: number,
): {
  seconds: number;
  steps: number;
  meters: number;
} {
  const today = new Date(nowMs).toDateString();
  const walks = history.filter(
    (walk) => walk.finishedAtMs !== null && new Date(walk.finishedAtMs).toDateString() === today,
  );
  const seconds = walks.reduce((sum, walk) => sum + walkDurationSeconds(walk, nowMs), 0);
  const steps = walks.reduce((sum, walk) => sum + walk.steps, 0);
  return { seconds, steps, meters: walks.reduce((sum, walk) => sum + walkDistanceMeters(walk), 0) };
}
