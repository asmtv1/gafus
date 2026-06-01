import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRow = vi.hoisted(() => ({
  value: null as null | {
    key: string;
    androidEnabled: boolean;
    iosEnabled: boolean;
    webDesktopEnabled: boolean;
    webTouchEnabled: boolean;
    paywallCtaEnabled: boolean;
    dailyAdLimit: number;
    yandexAndroidPlacementId: string | null;
    yandexIosPlacementId: string | null;
    yandexWebDesktopBlockId: string | null;
    yandexWebTouchBlockId: string | null;
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

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedAdSettings: {
      findUnique: prismaMocks.findUnique,
      upsert: prismaMocks.upsert,
    },
  },
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
  });

  it("returns disabled default settings when no database row exists", async () => {
    await expect(getRewardedAdSettings()).resolves.toMatchObject({
      androidEnabled: false,
      iosEnabled: false,
      webDesktopEnabled: false,
      webTouchEnabled: false,
      paywallCtaEnabled: false,
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

  it("requires a placement id before enabling a production platform", async () => {
    await expect(
      updateRewardedAdSettings({ androidEnabled: true, testMode: false }, "admin-1"),
    ).rejects.toThrow("placement");
  });
});
