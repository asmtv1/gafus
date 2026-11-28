import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

describe("Core feature flag contracts", () => {
  it("has no process-global forwarding or registration surface", async () => {
    const flags = await import("./appFeatureFlagsService");
    for (const name of ["getAppFeatureFlagEnabled", "getMobileFeatureFlagEnabled", "registerAppFeatureFlagsPort",
      "getMobileReleaseControl", "getMobileAppPublicConfig", "setAppFeatureFlagEnabled", "updateMobileReleaseControl"]) {
      expect(flags).not.toHaveProperty(name);
    }
  });
  it("preserves identical conflict/error class identities across Core and server", async () => {
    const core = await import("./appFeatureFlagsService");
    const server = await import("@gafus/feature-flags-server/appFeatureFlagsService");
    expect(core.MobileReleaseControlConflictError).toBe(server.MobileReleaseControlConflictError);
    expect(core.RetiredRewardedAdsReadOnlyError).toBe(server.RetiredRewardedAdsReadOnlyError);
    expect(new server.MobileReleaseControlConflictError())
      .toBeInstanceOf(core.MobileReleaseControlConflictError);
  });

  it("keeps the six public flags in Core and SQL adapter with no VK or review mode", async () => {
    const core = await import("./appFeatureFlagsService");
    const server = await import("@gafus/feature-flags-server/appFeatureFlagsService");
    for (const name of [
      "APP_FEATURE_APP_SUBSCRIPTION_GATING",
      "APP_FEATURE_APP_SUBSCRIPTION_PAYWALL",
      "APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT",
      "APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES",
      "APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT",
      "APP_FEATURE_MOBILE_REWARDED_ADS_IOS",
    ] as const) expect(core[name]).toBe(server[name]);
    expect(core).not.toHaveProperty("resolveMobileFeatureProfile");
    expect(core).not.toHaveProperty("APP_FEATURE_MOBILE_VK_LOGIN_IOS");
  });

  it("preserves exact client version and OTA policy validation", async () => {
    const flags = await import("./appFeatureFlagsService");
    expect(() => flags.normalizeOtaControl({ required: true, version: null, platform: "all" }))
      .toThrow();
    expect(flags.normalizeOtaControl({ required: true, version: "1.7.3-ota.1", platform: "ios" }))
      .toEqual({ required: true, version: "1.7.3-ota.1", platform: "ios" });
  });
});
