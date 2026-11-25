import { haversineMeters } from "./legacy";
import { directedMovement, plausible, validFix } from "./motion";
import { medianWalkFix } from "./smoothing";
import type { CanonicalPoint, TrackingCheckpoint, TrackingEvent, TrackingResult, WalkFix } from "./types";

export const TRACKING_CONFIG_V2 = Object.freeze({ reorderMs: 2_000, gapMs: 35_000, futureMs: 1_000, maxWindow: 12, maxPending: 64 });

export function createTrackingCheckpoint(epoch: string, startedAt: number, configVersion: 1 | 2 | 3 = 1): TrackingCheckpoint {
  return {
    version: 2, configVersion, epochStartSeq: 0, epoch, startedAt, active: true, segment: 1, seq: 0, meters: 0,
    sufficient: false, motion: "resuming", quality: "unknown", watermark: startedAt - 1,
    maxMeasuredAt: startedAt - 1, lastGood: null, anchor: null, lastOutput: null, previousCanonical: null, pendingCanonical: null, pending: [], motionWindow: [], rejected: 0,
  };
}

function output(s: TrackingCheckpoint, fix: WalkFix, points: CanonicalPoint[]): void {
  let deltaMeters = s.lastOutput ? haversineMeters(s.lastOutput, fix) : 0;
  if (deltaMeters > 1000) {
    s.segment++;
    s.lastOutput = null;
    deltaMeters = 0;
  }
  points.push({ ...fix, seq: ++s.seq, segment: s.segment, accepted: true, reason: s.lastOutput ? "ok" : "first", deltaMeters });
  s.meters += deltaMeters;
  s.lastOutput = fix;
}

function flushCanonical(s: TrackingCheckpoint, points: CanonicalPoint[]): void {
  if (s.pendingCanonical) output(s, s.pendingCanonical, points);
  s.pendingCanonical = null;
  s.previousCanonical = null;
}

function append(s: TrackingCheckpoint, fix: WalkFix, points: CanonicalPoint[]): void {
  if (s.configVersion === 1) {
    output(s,fix,points);
  } else if (!s.anchor) {
    output(s,fix,points);
    s.previousCanonical = fix;
  } else {
    if (s.pendingCanonical && s.previousCanonical) {
      output(s, medianWalkFix(s.previousCanonical,s.pendingCanonical,fix), points);
      s.previousCanonical = s.pendingCanonical;
    }
    s.pendingCanonical = fix;
  }
  s.anchor = fix;
}

function breakSegment(s: TrackingCheckpoint, points: CanonicalPoint[]): void {
  flushCanonical(s,points);
  if (s.anchor) s.segment++;
  s.anchor = null;
  s.lastOutput = null;
  s.lastGood = null;
  s.motionWindow = [];
  s.quality = "lost";
  s.motion = "resuming";
}

function consume(s: TrackingCheckpoint, f: WalkFix, points: CanonicalPoint[]): void {
  if (f.timestamp <= s.watermark) return;
  s.watermark = f.timestamp;
  if (!validFix(f)) {
    if (s.lastGood && f.timestamp - s.lastGood.timestamp > TRACKING_CONFIG_V2.gapMs) breakSegment(s, points);
    s.rejected++;
    return;
  }
  if (s.lastGood && f.timestamp - s.lastGood.timestamp > TRACKING_CONFIG_V2.gapMs) breakSegment(s, points);
  if (s.configVersion === 3 && !s.anchor && s.lastGood) {
    // Experimental lock: never let a rejected initial fix age into a plausible jump.
    // Slow/unknown speed requires spatial agreement, not just elapsed time.
    const candidate = s.lastGood;
    const dt = f.timestamp - candidate.timestamp;
    const moving = (candidate.speed ?? 0) >= 0.2 && (f.speed ?? 0) >= 0.2;
    const radius = Math.min(15, (candidate.accuracy ?? 0) + (f.accuracy ?? 0));
    const limit = moving ? Math.min(35, dt / 1000 * Math.max(candidate.speed!, f.speed!) + radius) : radius;
    if (dt > 12_000 || !plausible(candidate, f) || haversineMeters(candidate, f) > limit) {
      s.lastGood = f;
      s.rejected++;
      return;
    }
  }
  if (s.lastGood && !plausible(s.lastGood, f)) { s.rejected++; return; }
  if (!s.anchor) {
    // Two consistent observations establish a new segment, never connect a gap.
    if (!s.lastGood) { s.lastGood = f; return; }
    append(s, s.lastGood, points);
    s.quality = "good";
  }
  s.lastGood = f;
  s.sufficient = true;
  s.quality = "good";
  const anchor = s.anchor!;
  const distance = haversineMeters(anchor, f);
  const lowSpeed = f.speed === null || f.speed < 0.35;
  s.motionWindow = [...s.motionWindow, f].slice(-TRACKING_CONFIG_V2.maxWindow);
  if (s.motion === "moving" && !lowSpeed && distance >= 1) {
    append(s, f, points);
    s.motionWindow = [];
    return;
  }
  if (directedMovement(anchor, s.motionWindow)) {
    // Retain the initial movement, but never add an unobserved extrapolation.
    for (const fix of s.motionWindow) {
      if (fix.timestamp > s.anchor!.timestamp && haversineMeters(s.anchor!, fix) >= 1) append(s, fix, points);
    }
    s.motionWindow = [];
    s.motion = "moving";
    return;
  }
  s.motion = f.timestamp - anchor.timestamp >= 10_000 ? "stationary" : "possible_stop";
  if (s.motion === "stationary" && s.pendingCanonical) {
    const last = s.pendingCanonical;
    flushCanonical(s,points);
    s.previousCanonical = last;
  }
  if (s.motion === "stationary" && lowSpeed && distance < Math.max(5, (f.accuracy ?? 0) * 1.5)) {
    // Bound the stationary history; don't require a walker to overcome minutes of drift.
    s.motionWindow = s.motionWindow.slice(-3);
  }
}

function preferred(a: WalkFix, b: WalkFix): WalkFix {
  if (validFix(a) !== validFix(b)) return validFix(a) ? a : b;
  const rank = (f: WalkFix) => [f.accuracy ?? Infinity, f.latitude, f.longitude, f.speed ?? Infinity, f.course ?? Infinity];
  const ar = rank(a), br = rank(b);
  for (let i = 0; i < ar.length; i++) {
    if (ar[i]! < br[i]!) return a;
    if (ar[i]! > br[i]!) return b;
  }
  return a;
}

export function advanceTracking(previous: TrackingCheckpoint, event: TrackingEvent): TrackingResult {
  const points: CanonicalPoint[] = [];
  if (event.epoch !== previous.epoch || !previous.active && event.type !== "resume") return { checkpoint: previous, points };
  const s: TrackingCheckpoint = { ...previous, pending: [...previous.pending], motionWindow: [...previous.motionWindow] };
  const drain = (through: number) => {
    while (s.pending.length && s.pending[0]!.timestamp <= through) consume(s, s.pending.shift()!, points);
  };
  if (event.type === "fix") {
    const f = event.fix;
    if (!Number.isFinite(f.timestamp) || f.timestamp < s.startedAt || f.timestamp > event.receivedAt + TRACKING_CONFIG_V2.futureMs || f.timestamp <= s.watermark) {
      s.rejected++;
      return { checkpoint: s, points };
    }
    // Never serialize NaN/Infinity or coordinates that cannot be represented safely.
    if (!Number.isFinite(f.latitude) || !Number.isFinite(f.longitude) ||
        Math.abs(f.latitude) > 90 || Math.abs(f.longitude) > 180) {
      s.rejected++;
      return { checkpoint: s, points };
    }
    const clean: WalkFix = { ...f,
      accuracy: f.accuracy !== null && Number.isFinite(f.accuracy) ? f.accuracy : null,
      speed: f.speed !== null && Number.isFinite(f.speed) && f.speed >= 0 && f.speed <= 7 ? f.speed : null,
      course: f.course != null && Number.isFinite(f.course) && f.course >= 0 && f.course < 360 ? f.course : null };
    const duplicate = s.pending.findIndex(p => p.timestamp === clean.timestamp);
    if (duplicate >= 0) s.pending[duplicate] = preferred(s.pending[duplicate]!, clean);
    else s.pending.push(clean);
    s.pending.sort((a,b) => a.timestamp - b.timestamp);
    s.maxMeasuredAt = Math.max(s.maxMeasuredAt, clean.timestamp);
    drain(s.maxMeasuredAt - TRACKING_CONFIG_V2.reorderMs);
    while (s.pending.length > TRACKING_CONFIG_V2.maxPending) consume(s, s.pending.shift()!, points);
  } else if (event.type === "resume") {
    if (!s.active && event.at >= s.watermark) {
      breakSegment(s, points);
      s.epochStartSeq = s.seq;
      s.epoch = event.nextEpoch;
      s.startedAt = event.at;
      s.watermark = event.at - 1;
      s.maxMeasuredAt = s.watermark;
      s.active = true;
      s.pending = [];
    }
  } else {
    if (!Number.isFinite(event.at) || event.at < s.startedAt || event.at < s.watermark) return { checkpoint: previous, points };
    drain(event.at);
    if (event.type !== "flush") {
      s.pending = [];
      breakSegment(s, points);
      if (event.type !== "signal_lost") s.active = false;
      s.watermark = Math.max(s.watermark, event.at);
    }
  }
  return { checkpoint: s, points };
}
