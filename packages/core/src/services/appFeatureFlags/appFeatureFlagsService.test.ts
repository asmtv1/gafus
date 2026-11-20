import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  flags: new Map<string, boolean>(),
  policy: { revision: 1, otaRequired: false, otaVersion: null as string | null,
    otaPlatform: "all", updatedAt: new Date("2026-11-18T12:00:00.000Z"),
    updatedBy: null as null | { id: string; username: string } },
  role: "ADMIN",
  rewarded: { androidEnabled: false, dailyAdLimit: 1,
    yandexAndroidPlacementId: null, yandexIosPlacementId: null, testMode: true },
}));
const db = vi.hoisted(() => {
  const appFeatureFlag = {
    findUnique: vi.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(state.flags.has(where.key) ? { enabled: state.flags.get(where.key) } : null)),
    findMany: vi.fn(({ where }: { where: { key: { in: string[] } } }) =>
      Promise.resolve(where.key.in.filter(k => state.flags.has(k)).map(k => ({ key: k, enabled: state.flags.get(k)! })))),
    upsert: vi.fn(({ where, create, update }: { where: { key: string };
      create: { enabled: boolean }; update: { enabled: boolean } }) => {
      state.flags.set(where.key, update.enabled ?? create.enabled);
      return Promise.resolve({});
    }),
  };
  const mobileAppReleasePolicy = {
    findUnique: vi.fn(async () => ({ ...state.policy })),
    updateMany: vi.fn(async ({ where, data }: { where: { revision: number };
      data: { otaRequired: boolean; otaVersion: string | null; otaPlatform: string;
        revision: { increment: number }; updatedById: string } }) => {
      if (where.revision !== state.policy.revision) return { count: 0 };
      state.policy.otaRequired = data.otaRequired;
      state.policy.otaVersion = data.otaVersion;
      state.policy.otaPlatform = data.otaPlatform;
      state.policy.revision += data.revision.increment;
      state.policy.updatedBy = { id: data.updatedById, username: "admin" };
      return { count: 1 };
    }),
  };
  const user = { findUnique: vi.fn(async () => ({ role: state.role })) };
  const rewardedAdSettings = { findUnique: vi.fn(async () => state.rewarded) };
  const client = { appFeatureFlag, mobileAppReleasePolicy, user,
    rewardedAdSettings, $queryRaw: vi.fn().mockResolvedValue([{ id: "admin" }]) };
  return { ...client, $transaction: vi.fn((cb: (tx: typeof client) => Promise<unknown>) => cb(client)) };
});
vi.mock("@gafus/prisma", () => ({ prisma: db }));

import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
  getMobileFeatureFlagEnabled,
  getMobileAppPublicConfig,
  getMobileReleaseControl,
  normalizeOtaControl,
  updateMobileReleaseControl,
  MobileReleaseControlConflictError,
  RetiredRewardedAdsReadOnlyError,
} from "@gafus/feature-flags-server/appFeatureFlagsService";

const ios = { platform: "ios" as const, version: "1.7.5" };
const android = { platform: "android" as const, version: "1.7.5" };
const body = () => ({
  revision: state.policy.revision,
  ota: { required: false, version: null, platform: "all" as const },
  global: { appSubscriptionPaywall: true, appSubscriptionGating: true },
  rewardedAds: { ...state.rewarded },
});

beforeEach(() => {
  vi.clearAllMocks();
  state.flags.clear();
  state.policy = { revision: 1, otaRequired: false, otaVersion: null, otaPlatform: "all",
    updatedAt: new Date("2026-11-18T12:00:00.000Z"), updatedBy: null };
  state.role = "ADMIN";
});

describe("single public mobile feature configuration", () => {
  it("does not expose review/released modes or VK login in public config", async () => {
    state.flags.set(APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, false);
    const a = await getMobileAppPublicConfig(ios);
    const b = await getMobileAppPublicConfig(android);
    for (const config of [a,b]) {
      expect(config).not.toHaveProperty("resolvedFeatureProfile");
      expect(config).not.toHaveProperty("vkLoginEnabledOnIos");
      expect(config).not.toHaveProperty("iosRuCardPaymentEnabled");
      expect(config.appSubscriptionPaywallEnabled).toBe(false);
      expect(config.appSubscriptionGatingEnabled).toBe(true);
    }
    expect(a.resolvedClientVersion).toBe("1.7.5");
    expect(b.resolvedClientVersion).toBe("1.7.5");
  });

  it("applies identical flags to iOS and Android regardless of build version", async () => {
    state.flags.set(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
    expect(await getMobileFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, ios, true)).toBe(false);
    expect(await getMobileFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, android, true)).toBe(false);
    expect(await getMobileFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING,
      { platform: "ios", version: "1.7.0" }, true)).toBe(false);
  });

  it("hard-disables retired iOS checkout regardless of old database flags", async () => {
    state.flags.set(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, true);
    state.flags.set(APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES, true);
    for (const ctx of [ios, android]) {
      expect(await getMobileFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, ctx, true)).toBe(false);
      expect(await getMobileFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES, ctx, true)).toBe(false);
    }
  });

  it("preserves OTA revision locking, admin authorization and channel selection", async () => {
    const submitted = { ...body(),
      ota: { required: true, version: "1.7.5-ota.1", platform: "ios" as const } };
    const updated = await updateMobileReleaseControl(submitted, "admin");
    expect(updated.revision).toBe(2);
    expect(updated.ota).toEqual(submitted.ota);
    const stale = { ...body(), revision: 1 };
    await expect(updateMobileReleaseControl(stale, "admin"))
      .rejects.toBeInstanceOf(MobileReleaseControlConflictError);
  });

  it("rejects an admin who was demoted before the transaction", async () => {
    state.role = "USER";
    await expect(updateMobileReleaseControl(body(), "admin")).rejects.toThrow("FORBIDDEN");
    expect(db.mobileAppReleasePolicy.updateMany).not.toHaveBeenCalled();
  });

  it("prevents archived reward ads from being mutated", async () => {
    const changed = body();
    changed.rewardedAds.androidEnabled = true;
    await expect(updateMobileReleaseControl(changed, "admin"))
      .rejects.toBeInstanceOf(RetiredRewardedAdsReadOnlyError);
  });

  it("retains mandatory OTA validation", () => {
    expect(() => normalizeOtaControl({ required: true, version: null, platform: "all" })).toThrow();
    expect(normalizeOtaControl({ required: true, version: "1.7.5-ota.1", platform: "ios" }))
      .toEqual({ required: true, version: "1.7.5-ota.1", platform: "ios" });
    expect(() => normalizeOtaControl({ required: true, version: "bad", platform: "ios" })).toThrow();
  });

  it("returns current state without any review profile", async () => {
    const value = await getMobileReleaseControl();
    expect(value).not.toHaveProperty("review");
    expect(value).not.toHaveProperty("released");
    expect(value).not.toHaveProperty("iosReviewVersion");
    expect(value.global).toEqual({ appSubscriptionPaywall: true, appSubscriptionGating: true });
  });
});
