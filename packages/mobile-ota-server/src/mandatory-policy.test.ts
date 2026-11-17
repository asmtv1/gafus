import { describe, expect, it } from "vitest";
import { resolveMandatoryOtaPolicy as resolve } from "./mandatory-policy";

const policy = { required: true, version: "1.7.5-ota.6", platform: "android" as const, channel: "production" };
const base = { platform: "android" as const, runtimeVersion: "1.7.5", selectedRevision: 6 };

describe("mandatory OTA: exact signed-manifest rollout cohort", () => {
  it("blocks when the selected signed release satisfies the required revision", () => {
    expect(resolve(policy, base)).toEqual({ required: true, version: policy.version, selectedRevision: 6 });
    expect(resolve(policy, { ...base, selectedRevision: 7 }).required).toBe(true);
  });
  it("does NOT block installations assigned to previous release at 0, 1, 10, or 50% rollout", () => {
    expect(resolve(policy, { ...base, selectedRevision: 5 }).required).toBe(false);
    expect(resolve(policy, { ...base, selectedRevision: null }).required).toBe(false);
  });
  it("does not block wrong platform/runtime/channel, disabled policy or malformed revision", () => {
    expect(resolve(policy, { ...base, runtimeVersion: "1.7.4" }).required).toBe(false);
    expect(resolve(policy, { ...base, platform: "ios" }).required).toBe(false);
    expect(resolve({ ...policy, channel: "preview" }, base).required).toBe(false);
    expect(resolve({ ...policy, required: false }, base).required).toBe(false);
    expect(resolve({ ...policy, version: "oops" }, base).required).toBe(false);
    expect(resolve({ ...policy, version: "1.7.5-ota.9007199254740992" }, base).required).toBe(false);
  });
});
