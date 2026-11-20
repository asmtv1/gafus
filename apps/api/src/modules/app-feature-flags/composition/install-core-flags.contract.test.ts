import { describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  global: vi.fn(async () => false),
  mobile: vi.fn(async () => true),
}));
vi.mock("@gafus/feature-flags-server/appFeatureFlagsService", () => ({
  getAppFeatureFlagEnabled: mock.global,
  getMobileFeatureFlagEnabled: mock.mobile,
  getMobileReleaseControl: vi.fn(),
  getMobileAppPublicConfig: vi.fn(),
  setAppFeatureFlagEnabled: vi.fn(),
  updateMobileReleaseControl: vi.fn(),
}));

describe("API composition binds Core feature flag read to server once", () => {
  it("preserves real server decision even when fallback would allow access", async () => {
    const flags = await import("@gafus/core/services/appFeatureFlags");
    await import("./install-core-flags");
    await expect(flags.getAppFeatureFlagEnabled(
      flags.APP_FEATURE_APP_SUBSCRIPTION_GATING, true,
    )).resolves.toBe(false);
    expect(mock.global).toHaveBeenCalledWith("app_subscription_gating_enabled", true);
    const context = { platform: "ios" as const, version: "1.7.3" };
    await expect(flags.getMobileFeatureFlagEnabled(
      flags.APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, context, false,
    )).resolves.toBe(true);
    expect(mock.mobile).toHaveBeenCalledWith(
      "mobile_ios_ru_card_payment", context, false,
    );
  });
});
