import type { GpsSample } from "./legacy";

export interface WalkFix extends GpsSample {
  course?: number | null;
}
export type Motion = "moving" | "possible_stop" | "stationary" | "resuming";
export type Quality = "unknown" | "good" | "lost";
export interface CanonicalPoint extends WalkFix {
  seq: number;
  segment: number;
  accepted: true;
  reason: "first" | "ok";
  deltaMeters: number;
}
export interface TrackingCheckpoint {
  version: 2;
  configVersion: 1 | 2 | 3;
  epochStartSeq: number;
  epoch: string;
  startedAt: number;
  active: boolean;
  segment: number;
  seq: number;
  meters: number;
  sufficient: boolean;
  motion: Motion;
  quality: Quality;
  watermark: number;
  maxMeasuredAt: number;
  lastGood: WalkFix | null;
  /** Last accepted raw fix for motion inference, separate from output geometry. */
  anchor: WalkFix | null;
  lastOutput: WalkFix | null;
  previousCanonical: WalkFix | null;
  pendingCanonical: WalkFix | null;
  pending: WalkFix[];
  motionWindow: WalkFix[];
  rejected: number;
}
export type TrackingEvent =
  | { type: "fix"; epoch: string; receivedAt: number; fix: WalkFix }
  | { type: "flush" | "pause" | "finish" | "signal_lost"; epoch: string; at: number }
  | { type: "resume"; epoch: string; nextEpoch: string; at: number };
export interface TrackingResult {
  checkpoint: TrackingCheckpoint;
  points: CanonicalPoint[];
}
