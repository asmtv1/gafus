import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

function fakePort() {
  return {
    getAppFeatureFlagEnabled: vi.fn(async (_key: string, fallback = false) => fallback),
    getMobileFeatureFlagEnabled: vi.fn(async (
      _key: string, _context: { platform: string; version: string | null },
      released = false, _review = false,
    ) => released),
    getMobileReleaseControl: vi.fn(),
    getMobileAppPublicConfig: vi.fn(),
    setAppFeatureFlagEnabled: vi.fn(async () => {}),
    updateMobileReleaseControl: vi.fn(),
  };
}

describe("Core feature flags are a fail-closed composable port", () => {
  it("never silently assumes gating disabled or review flags enabled when unbound", async () => {
    const flags = await import("./appFeatureFlagsService");
    await expect(flags.getAppFeatureFlagEnabled(flags.APP_FEATURE_APP_SUBSCRIPTION_GATING, true))
      .rejects.toThrow("APP_FEATURE_FLAGS_PORT_UNBOUND");
    await expect(flags.getMobileFeatureFlagEnabled(
      flags.APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
      { platform: "ios", version: "1.7.3" }, false,
    )).rejects.toThrow("APP_FEATURE_FLAGS_PORT_UNBOUND");
    await expect(flags.getMobileReleaseControl())
      .rejects.toThrow("APP_FEATURE_FLAGS_PORT_UNBOUND");
  });
  it("forwards exact platform/profile/default parameters to authoritative adapter", async () => {
    const flags = await import("./appFeatureFlagsService");
    const adapter = fakePort();
    adapter.getAppFeatureFlagEnabled.mockResolvedValueOnce(false);
    adapter.getMobileFeatureFlagEnabled.mockResolvedValueOnce(true);
    flags.registerAppFeatureFlagsPort(adapter);
    const context = { platform: "ios" as const, version: "1.7.3" };
    await expect(flags.getAppFeatureFlagEnabled(flags.APP_FEATURE_APP_SUBSCRIPTION_GATING, true))
      .resolves.toBe(false);
    expect(adapter.getAppFeatureFlagEnabled).toHaveBeenCalledExactlyOnceWith(
      "app_subscription_gating_enabled", true,
    );
    await expect(flags.getMobileFeatureFlagEnabled(
      flags.APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES, context, false,
    )).resolves.toBe(true);
    expect(adapter.getMobileFeatureFlagEnabled).toHaveBeenCalledExactlyOnceWith(
      "mobile_ios_subscription_promo_codes", context, false,
    );
    await flags.setAppFeatureFlagEnabled("server_only_toggle", false);
    expect(adapter.setAppFeatureFlagEnabled).toHaveBeenCalledWith("server_only_toggle", false);
  });
  it("rejects reconfiguration of an active process without replacing its adapter", async () => {
    const flags = await import("./appFeatureFlagsService");
    const first = fakePort();
    flags.registerAppFeatureFlagsPort(first);
    flags.registerAppFeatureFlagsPort(first);
    expect(() => flags.registerAppFeatureFlagsPort(fakePort()))
      .toThrow("APP_FEATURE_FLAGS_PORT_ALREADY_BOUND");
    await flags.getAppFeatureFlagEnabled("existing", true);
    expect(first.getAppFeatureFlagEnabled).toHaveBeenCalledExactlyOnceWith("existing", true);
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
