import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  flags: new Map<string, { enabled: boolean; reviewEnabled: boolean | null }>(),
  policy: {
    key: "default",
    iosReviewVersion: null as string | null,
    revision: 1,
    updatedAt: new Date("2026-07-26T12:00:00.000Z"),
    updatedBy: null as { id: string; username: string } | null,
  },
  rewarded: null as null | {
    key: string;
    androidEnabled: boolean;
    iosEnabled: boolean;
    dailyAdLimit: number;
    yandexAndroidPlacementId: string | null;
    yandexIosPlacementId: string | null;
    testMode: boolean;
  },
}));

const prismaMock = vi.hoisted(() => {
  const appFeatureFlag = {
    findUnique: vi.fn(({ where }: { where: { key: string } }) => {
      const row = state.flags.get(where.key);
      return Promise.resolve(row ? { key: where.key, ...row } : null);
    }),
    findMany: vi.fn(({ where }: { where: { key: { in: string[] } } }) =>
      Promise.resolve(
        where.key.in.flatMap((key) => {
          const row = state.flags.get(key);
          return row ? [{ key, ...row }] : [];
        }),
      ),
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { enabled: boolean; reviewEnabled?: boolean | null };
        update: { enabled?: boolean; reviewEnabled?: boolean | null };
      }) => {
        const previous = state.flags.get(where.key);
        state.flags.set(where.key, {
          enabled: update.enabled ?? previous?.enabled ?? create.enabled,
          reviewEnabled:
            update.reviewEnabled ?? previous?.reviewEnabled ?? create.reviewEnabled ?? null,
        });
        return Promise.resolve({});
      },
    ),
  };
  const mobileAppReleasePolicy = {
    findUnique: vi.fn(() => Promise.resolve({ ...state.policy })),
    updateMany: vi.fn(
      ({
        where,
        data,
      }: {
        where: { revision: number };
        data: {
          iosReviewVersion: string | null;
          revision: { increment: number };
          updatedById: string;
        };
      }) => {
        if (where.revision !== state.policy.revision) {
          return Promise.resolve({ count: 0 });
        }
        state.policy.iosReviewVersion = data.iosReviewVersion;
        state.policy.revision += data.revision.increment;
        state.policy.updatedBy = {
          id: data.updatedById,
          username: "admin",
        };
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const rewardedAdSettings = {
    findUnique: vi.fn(() => Promise.resolve(state.rewarded)),
    upsert: vi.fn(({ create, update }: { create: typeof state.rewarded; update: object }) => {
      state.rewarded = { ...(state.rewarded ?? create), ...update } as NonNullable<
        typeof state.rewarded
      >;
      return Promise.resolve(state.rewarded);
    }),
  };
  const user = {
    findUnique: vi.fn().mockResolvedValue({ role: "ADMIN" }),
  };
  const client = {
    appFeatureFlag, mobileAppReleasePolicy, rewardedAdSettings, user,
    $queryRaw: vi.fn().mockResolvedValue([{ id: "admin-1" }]),
  };
  return {
    ...client,
    $transaction: vi.fn((callback: (tx: typeof client) => Promise<unknown>) => callback(client)),
  };
});

vi.mock("@gafus/prisma", () => ({ prisma: prismaMock }));

import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
  APP_FEATURE_MOBILE_REWARDED_ADS_IOS,
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  MobileReleaseControlConflictError,
  RetiredRewardedAdsReadOnlyError,
  getMobileAppPublicConfig,
  getMobileReleaseControl,
  resolveMobileFeatureProfile,
  setAppFeatureFlagEnabled,
  updateMobileReleaseControl,
} from "./appFeatureFlagsService";

describe("app feature flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.flags.clear();
    state.policy.iosReviewVersion = null;
    state.policy.revision = 1;
    state.policy.updatedBy = null;
    state.rewarded = null;
  });

  afterEach(() => vi.unstubAllEnvs());

  it("resolves only an exact iOS version to REVIEW", () => {
    expect(resolveMobileFeatureProfile({ platform: "ios", version: "1.7.0" }, "1.7.0")).toBe(
      "REVIEW",
    );
    expect(resolveMobileFeatureProfile({ platform: "ios", version: "1.6.3" }, "1.7.0")).toBe(
      "RELEASED",
    );
    expect(resolveMobileFeatureProfile({ platform: "android", version: "1.7.0" }, "1.7.0")).toBe(
      "RELEASED",
    );
    expect(resolveMobileFeatureProfile({ platform: "ios", version: null }, "1.7.0")).toBe(
      "RELEASED",
    );
  });

  it("returns independent released and review mobile values", async () => {
    state.policy.iosReviewVersion = "1.7.0";
    for (const key of [
      APP_FEATURE_MOBILE_VK_LOGIN_IOS,
      APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
      APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
      APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES,
    ]) {
      state.flags.set(key, { enabled: true, reviewEnabled: false });
    }

    await expect(
      getMobileAppPublicConfig({ platform: "ios", version: "1.7.0" }),
    ).resolves.toMatchObject({
      vkLoginEnabledOnIos: false,
      iosRuCardPaymentEnabled: false,
      iosRuCardPaymentHintEnabled: false,
      resolvedFeatureProfile: "REVIEW",
      resolvedClientVersion: "1.7.0",
    });
    await expect(
      getMobileAppPublicConfig({ platform: "ios", version: "1.6.3" }),
    ).resolves.toMatchObject({
      vkLoginEnabledOnIos: true,
      iosRuCardPaymentEnabled: true,
      iosRuCardPaymentHintEnabled: true,
      resolvedFeatureProfile: "RELEASED",
    });
  });

  it("keeps paywall and gating global for the review profile", async () => {
    state.policy.iosReviewVersion = "1.7.0";
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, true);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
    await expect(
      getMobileAppPublicConfig({ platform: "ios", version: "1.7.0" }),
    ).resolves.toMatchObject({
      appSubscriptionPaywallEnabled: true,
      appSubscriptionGatingEnabled: false,
    });
  });

  it("defaults review features to disabled and global safeguards to enabled", async () => {
    state.policy.iosReviewVersion = "1.7.0";
    await expect(
      getMobileAppPublicConfig({ platform: "ios", version: "1.7.0" }),
    ).resolves.toMatchObject({
      vkLoginEnabledOnIos: false,
      iosRuCardPaymentEnabled: false,
      iosRuCardPaymentHintEnabled: false,
      appSubscriptionPaywallEnabled: true,
      appSubscriptionGatingEnabled: true,
    });
  });

  it("rejects a demoted admin while holding the DB row lock", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: "USER" });
    await expect(updateMobileReleaseControl({
      revision: 1,
      iosReviewVersion: null,
      released: { vkLogin: false, iosRuCardPayment: false, subscriptionPromoCodes: false,
        iosRuCardPaymentHint: false, rewardedAds: false },
      review: { vkLogin: false, iosRuCardPayment: false, subscriptionPromoCodes: false,
        iosRuCardPaymentHint: false, rewardedAds: false },
      global: { appSubscriptionPaywall: true, appSubscriptionGating: true },
      rewardedAds: { androidEnabled: false, dailyAdLimit: 1,
        yandexAndroidPlacementId: null, yandexIosPlacementId: null, testMode: true },
    }, "admin-1")).rejects.toThrow("FORBIDDEN");
    expect(prismaMock.mobileAppReleasePolicy.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
  });

  it("updates supported profiles without touching archived ads", async () => {
    const result = await updateMobileReleaseControl(
      {
        revision: 1,
        iosReviewVersion: "1.7.0",
        released: {
          vkLogin: true,
          iosRuCardPayment: true,
          iosRuCardPaymentHint: true,
          subscriptionPromoCodes: true,
          rewardedAds: false,
        },
        review: {
          vkLogin: false,
          iosRuCardPayment: false,
          iosRuCardPaymentHint: false,
          subscriptionPromoCodes: false,
          rewardedAds: false,
        },
        global: {
          appSubscriptionPaywall: true,
          appSubscriptionGating: true,
        },
        rewardedAds: {
          androidEnabled: false,
          dailyAdLimit: 1,
          yandexAndroidPlacementId: null,
          yandexIosPlacementId: null,
          testMode: true,
        },
      },
      "admin-1",
    );

    expect(result.revision).toBe(2);
    expect(state.flags.get(APP_FEATURE_MOBILE_REWARDED_ADS_IOS)).toBeUndefined();
    expect(state.rewarded).toBeNull();
    expect(prismaMock.rewardedAdSettings.upsert).not.toHaveBeenCalled();
    expect(result.rewardedAds.dailyAdLimit).toBe(1);
  });

  it("preserves existing historic ad settings while updating unrelated mobile flags", async () => {
    state.flags.set(APP_FEATURE_MOBILE_REWARDED_ADS_IOS, {
      enabled: true, reviewEnabled: true,
    });
    state.rewarded = {
      key: "default", androidEnabled: true, iosEnabled: true,
      dailyAdLimit: 9, yandexAndroidPlacementId: "historical-android",
      yandexIosPlacementId: "historical-ios", testMode: false,
    };
    const snapshot = await getMobileReleaseControl();
    const historical = { ...state.rewarded };
    const result = await updateMobileReleaseControl({
      revision: snapshot.revision,
      iosReviewVersion: "1.7.0",
      released: { ...snapshot.released, vkLogin: true },
      review: snapshot.review,
      global: snapshot.global,
      rewardedAds: snapshot.rewardedAds,
    }, "admin-1");
    expect(result.revision).toBe(2);
    expect(result.released.vkLogin).toBe(true);
    expect(result.released.rewardedAds).toBe(true);
    expect(result.review.rewardedAds).toBe(true);
    expect(state.rewarded).toEqual(historical);
    expect(prismaMock.rewardedAdSettings.upsert).not.toHaveBeenCalled();
    expect(prismaMock.appFeatureFlag.upsert.mock.calls.some(([arg]) =>
      arg.where.key === APP_FEATURE_MOBILE_REWARDED_ADS_IOS)).toBe(false);
  });

  it("rejects direct Core attempts to enable retired iOS ads before writes", async () => {
    const archived = {
      revision: 1, iosReviewVersion: null,
      released: { vkLogin: false, iosRuCardPayment: false, subscriptionPromoCodes: false,
        iosRuCardPaymentHint: false, rewardedAds: true },
      review: { vkLogin: false, iosRuCardPayment: false, subscriptionPromoCodes: false,
        iosRuCardPaymentHint: false, rewardedAds: false },
      global: { appSubscriptionPaywall: true, appSubscriptionGating: true },
      rewardedAds: { androidEnabled: false, dailyAdLimit: 1,
        yandexAndroidPlacementId: null, yandexIosPlacementId: null, testMode: true },
    };
    await expect(updateMobileReleaseControl(archived, "admin-1"))
      .rejects.toBeInstanceOf(RetiredRewardedAdsReadOnlyError);
    expect(prismaMock.mobileAppReleasePolicy.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.rewardedAdSettings.upsert).not.toHaveBeenCalled();
  });

  it("rejects a stale revision before changing flags", async () => {
    state.policy.revision = 2;
    await expect(
      updateMobileReleaseControl(
        {
          revision: 1,
          iosReviewVersion: "1.7.0",
          released: {
            vkLogin: true,
            iosRuCardPayment: true,
            iosRuCardPaymentHint: true,
            subscriptionPromoCodes: true,
            rewardedAds: false,
          },
          review: {
            vkLogin: false,
            iosRuCardPayment: false,
            iosRuCardPaymentHint: false,
            subscriptionPromoCodes: false,
            rewardedAds: false,
          },
          global: {
            appSubscriptionPaywall: true,
            appSubscriptionGating: true,
          },
          rewardedAds: {
            androidEnabled: false,
            dailyAdLimit: 1,
            yandexAndroidPlacementId: null,
            yandexIosPlacementId: null,
            testMode: true,
          },
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(MobileReleaseControlConflictError);
    expect(state.flags.size).toBe(0);
  });

  it.each([-1, 101, 1.5])("rejects mutation of retired ad limit %s", async (dailyAdLimit) => {
    await expect(
      updateMobileReleaseControl(
        {
          revision: 1,
          iosReviewVersion: null,
          released: {
            vkLogin: false,
            iosRuCardPayment: false,
            iosRuCardPaymentHint: false,
            subscriptionPromoCodes: false,
            rewardedAds: false,
          },
          review: {
            vkLogin: false,
            iosRuCardPayment: false,
            iosRuCardPaymentHint: false,
            subscriptionPromoCodes: false,
            rewardedAds: false,
          },
          global: { appSubscriptionPaywall: true, appSubscriptionGating: true },
          rewardedAds: {
            androidEnabled: false,
            dailyAdLimit,
            yandexAndroidPlacementId: null,
            yandexIosPlacementId: null,
            testMode: true,
          },
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(RetiredRewardedAdsReadOnlyError);
    expect(state.policy.revision).toBe(1);
  });

  it("returns validated runtime version policy overrides", async () => {
    vi.stubEnv("MOBILE_IOS_MIN_VERSION", "2.0.0");
    vi.stubEnv("MOBILE_ANDROID_MIN_VERSION", "2.1.0");
    vi.stubEnv("MOBILE_IOS_STORE_URL", "https://apps.apple.com/app/id1");
    vi.stubEnv("MOBILE_ANDROID_STORE_URL", "https://www.rustore.ru/catalog/app/test");
    await expect(getMobileAppPublicConfig()).resolves.toMatchObject({
      minimumSupportedVersion: { ios: "2.0.0", android: "2.1.0" },
      storeUrl: {
        ios: "https://apps.apple.com/app/id1",
        android: "https://www.rustore.ru/catalog/app/test",
      },
    });
  });
});
