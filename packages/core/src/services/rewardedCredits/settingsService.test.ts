import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRow = vi.hoisted(() => ({
  value: null as null | {
    key: string;
    androidEnabled: boolean;
    iosEnabled: boolean;
    dailyAdLimit: number;
    yandexAndroidPlacementId: string | null;
    yandexIosPlacementId: string | null;
    testMode: boolean;
  },
}));

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(() => Promise.resolve(settingsRow.value)),
  upsert: vi.fn(
    ({
      create,
      update,
    }: {
      create: typeof settingsRow.value;
      update: Partial<NonNullable<typeof settingsRow.value>>;
    }) => {
      settingsRow.value = {
        ...(settingsRow.value ?? create),
        ...update,
      } as NonNullable<typeof settingsRow.value>;
      return Promise.resolve(settingsRow.value);
    },
  ),
}));
const getMobileFeatureFlagEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedAdSettings: {
      findUnique: prismaMocks.findUnique,
      upsert: prismaMocks.upsert,
    },
  },
}));

vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_REWARDED_ADS_IOS: "mobile_rewarded_ads_ios",
  getMobileFeatureFlagEnabled: getMobileFeatureFlagEnabledMock,
}));

import {
  getRewardedAdSettings,
  resolveRewardedPlatformSettings,
  updateRewardedAdSettings,
} from "./settingsService";

describe("rewarded ad settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRow.value = null;
    getMobileFeatureFlagEnabledMock.mockResolvedValue(false);
  });

  it("returns disabled default settings when no database row exists", async () => {
    await expect(getRewardedAdSettings()).resolves.toMatchObject({
      androidEnabled: false,
      iosEnabled: false,
      dailyAdLimit: 1,
      testMode: true,
    });
  });

  it("rejects a daily limit outside the allowed product contract", async () => {
    await expect(updateRewardedAdSettings({ dailyAdLimit: 4 }, "admin-1")).rejects.toThrow(
      "dailyAdLimit",
    );
  });

  it("normalizes placement ids and allows enabled platforms in test mode", async () => {
    await updateRewardedAdSettings(
      {
        androidEnabled: true,
        testMode: true,
        yandexAndroidPlacementId: "  demo-rewarded-yandex  ",
      },
      "admin-1",
    );

    await expect(resolveRewardedPlatformSettings("ANDROID")).resolves.toMatchObject({
      platformEnabled: true,
      placementId: "demo-rewarded-yandex",
      testMode: true,
    });
  });

  it("resolves Android and iOS enablement independently", async () => {
    await updateRewardedAdSettings(
      {
        androidEnabled: true,
        iosEnabled: false,
        testMode: true,
      },
      "admin-1",
    );

    await expect(resolveRewardedPlatformSettings("ANDROID")).resolves.toMatchObject({
      platform: "ANDROID",
      platformEnabled: true,
    });
    await expect(resolveRewardedPlatformSettings("IOS")).resolves.toMatchObject({
      platform: "IOS",
      platformEnabled: false,
    });
  });

  it("uses the versioned iOS flag when client context is available", async () => {
    settingsRow.value = {
      key: "default",
      androidEnabled: true,
      iosEnabled: true,
      dailyAdLimit: 1,
      yandexAndroidPlacementId: "android-id",
      yandexIosPlacementId: "ios-id",
      testMode: false,
    };
    getMobileFeatureFlagEnabledMock.mockResolvedValueOnce(false);

    await expect(
      resolveRewardedPlatformSettings("IOS", {
        platform: "ios",
        version: "1.6.4",
      }),
    ).resolves.toMatchObject({
      platform: "IOS",
      platformEnabled: false,
    });
    expect(getMobileFeatureFlagEnabledMock).toHaveBeenCalledWith(
      "mobile_rewarded_ads_ios",
      { platform: "ios", version: "1.6.4" },
      true,
      false,
    );
  });

  it("requires a placement id before enabling a production platform", async () => {
    await expect(
      updateRewardedAdSettings({ androidEnabled: true, testMode: false }, "admin-1"),
    ).rejects.toThrow("placement");
  });
});
