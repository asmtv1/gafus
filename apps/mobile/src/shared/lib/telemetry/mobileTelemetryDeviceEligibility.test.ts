import { describe, expect, it } from "vitest";
import { mayUploadMobileTelemetry } from "./mobileTelemetryDeviceEligibility";

describe("trusted mobile telemetry origin", () => {
  it.each(["ios", "android"])("permits enabled physical %s", platform => {
    expect(mayUploadMobileTelemetry(true, true, platform)).toBe(true);
    expect(mayUploadMobileTelemetry(false, true, platform)).toBe(false);
    expect(mayUploadMobileTelemetry(true, false, platform)).toBe(false);
  });
  it("does not send telemetry from web or unknown platforms", () => {
    expect(mayUploadMobileTelemetry(true, true, "web")).toBe(false);
  });
});
