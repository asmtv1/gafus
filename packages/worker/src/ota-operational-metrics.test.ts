import { describe, expect, it } from "vitest";
import { renderOtaOperationalMetrics } from "./ota-operational-metrics";

describe("OTA operational telemetry metrics", () => {
  it("exposes fixed platform and event gauges, excluding unexpected labels", () => {
    const text = renderOtaOperationalMetrics([
      { platform: "ios", event: "UPDATE_ERROR", count: 5 },
      { platform: "android", event: "LAUNCHED", count: 3 },
      { platform: "ios", event: "SIGNATURE_REJECTED", count: 2 },
      { platform: "android", event: "MANDATORY_INCOMPLETE", count: 4 },
      { platform: "untrusted", event: "bad", count: 9 },
    ]);
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="ios",event="UPDATE_ERROR"} 5');
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="android",event="LAUNCHED"} 3');
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="ios",event="LAUNCHED"} 0');
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="ios",event="SIGNATURE_REJECTED"} 2');
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="android",event="MANDATORY_INCOMPLETE"} 4');
    expect(text).toContain('gafus_mobile_telemetry_ota_reported_events_1h{platform="ios",event="MANDATORY_ATTEMPT"} 0');
    expect(text).not.toContain("untrusted");
    expect(text.split("\n").filter(line => line.startsWith("gafus_mobile_telemetry_ota_reported_events_1h{"))).toHaveLength(16);
  });

  it("distinguishes no reports from unavailable metrics", () => {
    expect(renderOtaOperationalMetrics([])).toContain("gafus_mobile_telemetry_ota_metrics_available 1");
    const unavailable = renderOtaOperationalMetrics(null);
    expect(unavailable).toContain("gafus_mobile_telemetry_ota_metrics_available 0");
    expect(unavailable).not.toContain("gafus_mobile_telemetry_ota_reported_events_1h");
  });
});
