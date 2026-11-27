import { describe, expect, it } from "vitest";
import { renderWalkGpsMetrics } from "./walk-gps-metrics";

describe("synced GPS walk gauges", () => {
  it("exports one bounded cohort and separate missing/insufficient counts", () => {
    const text = renderWalkGpsMetrics({eligible: 20, noPoints: 3, insufficientFix: 2});
    expect(text).toContain("gafus_mobile_telemetry_walk_gps_available 1");
    expect(text).toContain("gafus_mobile_telemetry_walk_gps_eligible_1h 20");
    expect(text).toContain("gafus_mobile_telemetry_walk_gps_no_points_1h 3");
    expect(text).toContain("gafus_mobile_telemetry_walk_gps_insufficient_fix_1h 2");
  });
  it("never mistakes a failed query for a successful empty cohort", () => {
    expect(renderWalkGpsMetrics(null)).not.toContain("eligible_1h");
    expect(renderWalkGpsMetrics(null)).toContain("gafus_mobile_telemetry_walk_gps_available 0");
    expect(renderWalkGpsMetrics({eligible: 0, noPoints: 0, insufficientFix: 0})).toContain("eligible_1h 0");
  });
});
