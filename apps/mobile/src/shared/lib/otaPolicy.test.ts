import { describe, expect, it } from "vitest";
import { activeOtaRevision, requiredOtaRevision } from "./otaPolicy";

const policy = { required: true, version: "1.7.3-ota.2", platform: "all" as const, channel: "production" as const };
const context = { platform: "android", nativeVersion: "1.7.3", runtimeVersion: "1.7.3", channel: "production", currentRevision: 0 };
describe("forced OTA gate 1.7.3", () => {
  it("embeds revision zero in native 1.7.3 and optional OTA by default", () => {
    expect(activeOtaRevision()).toBe(0);
  });
  it("blocks an old OTA revision on the matching production runtime", () => {
    expect(requiredOtaRevision(policy, context)).toBe(2);
  });
  it("unblocks matching or later revision", () => {
    expect(requiredOtaRevision(policy, { ...context, currentRevision: 2 })).toBeNull();
    expect(requiredOtaRevision(policy, { ...context, currentRevision: 3 })).toBeNull();
  });
  it("does not block when optional", () => {
    expect(requiredOtaRevision({ ...policy, required: false }, context)).toBeNull();
  });
  it("cannot block incompatible store runtime, channel or platform", () => {
    expect(requiredOtaRevision(policy, { ...context, nativeVersion: "1.7.2" })).toBeNull();
    expect(requiredOtaRevision(policy, { ...context, runtimeVersion: "1.7.4" })).toBeNull();
    expect(requiredOtaRevision(policy, { ...context, channel: "preview" })).toBeNull();
    expect(requiredOtaRevision({ ...policy, platform: "ios" }, context)).toBeNull();
  });
  it("ignores invalid or future native baselines", () => {
    expect(requiredOtaRevision({ ...policy, version: "invalid" }, context)).toBeNull();
    expect(requiredOtaRevision({ ...policy, version: "1.7.4-ota.2" }, { ...context, nativeVersion: "1.7.4", runtimeVersion: "1.7.4" })).toBeNull();
  });
});
