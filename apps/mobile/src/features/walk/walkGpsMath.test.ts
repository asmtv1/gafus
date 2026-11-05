import { describe, expect, it } from "vitest";
import {
  classifyGpsSample,
  haversineMeters,
  normalizeGpsBatch,
  type GpsSample,
} from "./walkGpsMath";
const a: GpsSample = {
  latitude: 53.195,
  longitude: 50.1,
  timestamp: 100000,
  accuracy: 5,
  speed: 1.1,
};
describe("walk GPS track filtering", () => {
  it("accepts a first good fix but adds no distance", () =>
    expect(classifyGpsSample(null, a)).toMatchObject({ accepted: true, meters: 0 }));
  it("rejects impossible jumps while retaining the ability to store raw fixes", () =>
    expect(classifyGpsSample(a, { ...a, latitude: 54.0, timestamp: 102000 }).reason).toBe("jump"));
  it("does not count stationary GPS jitter", () =>
    expect(classifyGpsSample(a, { ...a, latitude: 53.195005, timestamp: 105000 }).reason).toBe(
      "stationary",
    ));
  it("accepts walking distance", () =>
    expect(classifyGpsSample(a, { ...a, latitude: 53.1951, timestamp: 110000 }).accepted).toBe(
      true,
    ));
  it("never accepts stale or low accuracy fixes", () => {
    expect(classifyGpsSample(a, a).reason).toBe("out_of_order");
    expect(classifyGpsSample(a, { ...a, accuracy: 100 }).reason).toBe("poor_accuracy");
  });
  it("uses spherical earth geometry", () =>
    expect(haversineMeters(a, { ...a, latitude: a.latitude + 0.001 })).toBeGreaterThan(110));
});

describe("GPS batch defensive normalization", () => {
  it("isolates malformed native fixes so they cannot poison good SQLite rows", () => {
    const fixed = normalizeGpsBatch([
      { ...a, latitude: NaN },
      { ...a, timestamp: Infinity },
      { ...a, accuracy: Infinity, speed: NaN, timestamp: 111000 },
      { ...a, latitude: 91, timestamp: 110000 },
    ]);
    expect(fixed).toHaveLength(2);
    expect(fixed[0]).toMatchObject({ latitude: 91, timestamp: 110000 });
    expect(classifyGpsSample(null, fixed[0]!).reason).toBe("invalid");
    expect(fixed[1]).toMatchObject({ accuracy: null, speed: null, timestamp: 111000 });
  });
});
