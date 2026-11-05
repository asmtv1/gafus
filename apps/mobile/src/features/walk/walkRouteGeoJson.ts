import type { StoredGpsPoint } from "./walkGpsStorage";

/** One LineString per segment; rejected fixes and pauses never create false connections. */
export function toWalkGeoJson(points: StoredGpsPoint[]) {
  const groups = new Map<number, [number, number][]>();
  for (const p of points) {
    if (!p.accepted || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const group = groups.get(p.segment) ?? [];
    group.push([p.longitude, p.latitude]);
    groups.set(p.segment, group);
  }
  return {
    type: "FeatureCollection" as const,
    features: [...groups.entries()]
      .filter(([, coords]) => coords.length > 1)
      .map(([segment, coordinates]) => ({
        type: "Feature" as const,
        properties: { segment },
        geometry: { type: "LineString" as const, coordinates },
      })),
  };
}
