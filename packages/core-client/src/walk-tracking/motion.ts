import { haversineMeters } from "./legacy";
import type { WalkFix } from "./types";

export function validFix(f: WalkFix): boolean {
  return Number.isFinite(f.timestamp) && f.timestamp > 0 &&
    Number.isFinite(f.latitude) && Math.abs(f.latitude) <= 90 &&
    Number.isFinite(f.longitude) && Math.abs(f.longitude) <= 180 &&
    f.accuracy !== null && Number.isFinite(f.accuracy) && f.accuracy >= 0 && f.accuracy <= 25;
}

export function plausible(a: WalkFix, b: WalkFix): boolean {
  const dt = (b.timestamp - a.timestamp) / 1000;
  return dt > 0 && haversineMeters(a, b) <= dt * 7 + Math.max(a.accuracy ?? 0, b.accuracy ?? 0);
}

export function directedMovement(anchor: WalkFix, window: readonly WalkFix[]): boolean {
  const end = window[window.length - 1];
  if (!end) return false;
  if (window.length === 1) {
    return anchor.speed !== null && anchor.speed >= 0.35 &&
      end.speed !== null && end.speed >= 0.35 &&
      haversineMeters(anchor, end) >= Math.max(3, (end.accuracy ?? 0) * 0.4);
  }
  const displacement = haversineMeters(anchor, end);
  let length = 0;
  let previous = anchor;
  for (const fix of window) {
    length += haversineMeters(previous, fix);
    previous = fix;
  }
  // Net progress rather than oscillating positional noise. Native speed is only supporting evidence.
  const positiveSpeed = window.filter(f => f.speed !== null && f.speed >= 0.2 && f.speed <= 7).length;
  const threshold = positiveSpeed >= 2
    ? Math.max(2, (end.accuracy ?? 0) * 0.35)
    : Math.max(5, (end.accuracy ?? 0) * 1.5);
  return displacement >= threshold && length > 0 && displacement / length >= 0.75;
}
