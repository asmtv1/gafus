/** GPS filters use source accuracy and elapsed time, not arbitrary map snapping. */
export interface GpsSample {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
  speed: number | null;
}
export interface GpsDecision {
  accepted: boolean;
  meters: number;
  reason: "first" | "ok" | "invalid" | "poor_accuracy" | "out_of_order" | "jump" | "stationary";
}
const EARTH_METERS = 6371008.8;
export function haversineMeters(
  a: Pick<GpsSample, "latitude" | "longitude">,
  b: Pick<GpsSample, "latitude" | "longitude">,
): number {
  const radians = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * radians;
  const dlon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function classifyGpsSample(previous: GpsSample | null, current: GpsSample): GpsDecision {
  if (
    !Number.isFinite(current.latitude) ||
    Math.abs(current.latitude) > 90 ||
    !Number.isFinite(current.longitude) ||
    Math.abs(current.longitude) > 180 ||
    !Number.isFinite(current.timestamp) ||
    current.timestamp <= 0
  )
    return { accepted: false, meters: 0, reason: "invalid" };
  if (
    current.accuracy === null ||
    !Number.isFinite(current.accuracy) ||
    current.accuracy < 0 ||
    current.accuracy > 45
  ) {
    return { accepted: false, meters: 0, reason: "poor_accuracy" };
  }
  if (!previous) return { accepted: true, meters: 0, reason: "first" };
  const seconds = (current.timestamp - previous.timestamp) / 1000;
  if (seconds <= 0) return { accepted: false, meters: 0, reason: "out_of_order" };
  // After a long signal gap start a new connected segment rather than drawing a line.
  if (seconds > 90) return { accepted: false, meters: 0, reason: "jump" };
  const meters = haversineMeters(previous, current);
  // Plausible dog walking / running cap, with GPS positional uncertainty margin.
  if (meters > seconds * 7 + Math.max(previous.accuracy ?? 0, current.accuracy)) {
    return { accepted: false, meters: 0, reason: "jump" };
  }
  // Negative/unknown speed cannot prove a stop. When GNSS explicitly reports
  // near-zero speed, tighten the jitter suppression while respecting accuracy.
  if (
    current.speed != null &&
    current.speed >= 0 &&
    current.speed < 0.35 &&
    meters <= Math.max(8, Math.min(20, ((previous.accuracy ?? 0) + current.accuracy) * 0.75))
  ) {
    return { accepted: false, meters: 0, reason: "stationary" };
  }
  // Do not accumulate sensor noise while a walker stands still.
  if (meters < Math.max(3, Math.min(10, ((previous.accuracy ?? 0) + current.accuracy) * 0.35))) {
    return { accepted: false, meters: 0, reason: "stationary" };
  }
  return { accepted: true, meters, reason: "ok" };
}

/** A malformed native fix must not roll back an entire SQLite GPS batch.
 * Non-finite required coordinates/times cannot be represented as raw SQLite rows;
 * finite but implausible fixes remain available to diagnose GPS failures. */
export function normalizeGpsBatch(samples: readonly GpsSample[]): GpsSample[] {
  return samples
    .filter(
      (sample) =>
        Number.isFinite(sample.latitude) &&
        Number.isFinite(sample.longitude) &&
        Number.isFinite(sample.timestamp),
    )
    .map((sample) => ({
      ...sample,
      accuracy:
        sample.accuracy !== null && Number.isFinite(sample.accuracy) ? sample.accuracy : null,
      speed: sample.speed !== null && Number.isFinite(sample.speed) ? sample.speed : null,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
