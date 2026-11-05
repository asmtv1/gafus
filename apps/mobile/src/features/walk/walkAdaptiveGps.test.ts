import { describe, expect, it } from "vitest";
import {
  DEFAULT_WALK_GPS_POLICY,
  WALK_GPS_INTERVALS,
  advanceWalkGpsPolicy,
  detectWalkGpsMode,
} from "./walkAdaptiveGps";
const fix = (speed: number, accuracy = 5) => ({
  latitude: 53.1,
  longitude: 50.1,
  timestamp: 60_000,
  accuracy,
  speed,
});
describe("battery-aware location tracking policy", () => {
  it("distinguishes walking, slow walking and standing with good GNSS fixes", () => {
    expect(detectWalkGpsMode([fix(1.5), fix(1.2)])).toBe("walking");
    expect(detectWalkGpsMode([fix(0.55), fix(0.65)])).toBe("slow");
    expect(detectWalkGpsMode([fix(0.05), fix(0.1)])).toBe("stationary");
    expect(detectWalkGpsMode([fix(0, 100)])).toBeNull();
  });
  it("does not flap when a dog briefly stops to sniff", () => {
    const first = advanceWalkGpsPolicy(DEFAULT_WALK_GPS_POLICY, "stationary", 60_000);
    expect(first.mode).toBe("walking");
    const stopped = advanceWalkGpsPolicy(first, "stationary", 105_000);
    expect(stopped.mode).toBe("stationary");
    expect(advanceWalkGpsPolicy(stopped, "walking", 106_000).mode).toBe("stationary");
    const resumed = advanceWalkGpsPolicy(
      advanceWalkGpsPolicy(stopped, "walking", 131_000),
      "walking",
      143_000,
    );
    expect(resumed.mode).toBe("walking");
  });
  it("retains the current profile when speed is unavailable", () => {
    expect(advanceWalkGpsPolicy(DEFAULT_WALK_GPS_POLICY, null, 120000)).toEqual(
      DEFAULT_WALK_GPS_POLICY,
    );
  });
  it("uses distinct OS delivery hints for each motion state", () => {
    expect(WALK_GPS_INTERVALS.walking.timeInterval).toBe(4000);
    expect(WALK_GPS_INTERVALS.slow.timeInterval).toBe(8000);
    expect(WALK_GPS_INTERVALS.stationary.distanceInterval).toBe(25);
  });
});

describe("Android background safety contract", () => {
  it("reconfigures ONLY an existing foreground location task, never starts a new service from background", async () => {
    const { readFileSync } = await import("node:fs");
    const patch = readFileSync(
      new URL("../../../../../patches/expo-location@55.1.15.patch", import.meta.url),
      "utf8",
    );
    expect(patch).toContain(
      "!mTaskManager.taskHasConsumerOfClass(taskName, LocationTaskConsumer::class.java)",
    );
    expect(patch).toContain("throw ForegroundServiceStartNotAllowedException()");
    expect(patch).toContain("options.widgetInitiated != true");
    expect(patch).toContain('val widgetInitiated = task.options["widgetInitiated"] == true');
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    );
    expect(packageJson.expo.autolinking.android.buildFromSource).toContain("expo-location");
  });
});
