import type { GpsSample } from "./walkGpsMath";

export type WalkGpsMode = "walking" | "slow" | "stationary";
export interface WalkGpsPolicyState {
  mode: WalkGpsMode;
  candidate: WalkGpsMode | null;
  candidateSinceMs: number;
  changedAtMs: number;
}
export const DEFAULT_WALK_GPS_POLICY: WalkGpsPolicyState = {
  mode: "walking",
  candidate: null,
  candidateSinceMs: 0,
  changedAtMs: 0,
};

/** Use good, recent GNSS speed as the first signal; speed values are m/s. */
export function detectWalkGpsMode(samples: readonly GpsSample[]): WalkGpsMode | null {
  const speeds = samples
    .filter(
      (p) =>
        p.accuracy != null &&
        p.accuracy <= 30 &&
        p.speed != null &&
        Number.isFinite(p.speed) &&
        p.speed >= 0 &&
        p.speed <= 8,
    )
    .slice(-5)
    .map((p) => p.speed!);
  if (!speeds.length) return null;
  const speed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return speed >= 1.05 ? "walking" : speed >= 0.35 ? "slow" : "stationary";
}

/** State advances only with real fixes, never on a timer while iOS stops delivering. */
export function advanceWalkGpsPolicy(
  state: WalkGpsPolicyState,
  proposed: WalkGpsMode | null,
  nowMs: number,
): WalkGpsPolicyState {
  if (!proposed || !Number.isFinite(nowMs) || nowMs <= 0) return state;
  if (proposed === state.mode) return { ...state, candidate: null, candidateSinceMs: 0 };
  const candidateSinceMs = proposed === state.candidate ? state.candidateSinceMs : nowMs;
  const dwellMs = proposed === "walking" ? 12_000 : proposed === "slow" ? 20_000 : 45_000;
  if (nowMs - candidateSinceMs < dwellMs || nowMs - state.changedAtMs < 25_000) {
    return { ...state, candidate: proposed, candidateSinceMs };
  }
  return { mode: proposed, candidate: null, candidateSinceMs: 0, changedAtMs: nowMs };
}

export const WALK_GPS_INTERVALS = {
  walking: { timeInterval: 4_000, distanceInterval: 5 },
  slow: { timeInterval: 8_000, distanceInterval: 10 },
  stationary: { timeInterval: 20_000, distanceInterval: 25 },
} as const;
