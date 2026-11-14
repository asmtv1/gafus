import { describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  read: vi.fn(async () => ({
    androidEnabled: false,
    iosEnabled: false,
    dailyAdLimit: 1,
    yandexAndroidPlacementId: null,
    yandexIosPlacementId: null,
    testMode: true,
  })),
  write: vi.fn(async (row: object) => row),
}));
vi.mock("@gafus/gafus-server/rewarded-settings", () => ({
  readRewardedAdSettingsRow: mock.read,
  writeRewardedAdSettingsRow: mock.write,
}));

describe("API binds durable rewarded settings before handling requests", () => {
  it("delegates reads and retains the existing public DTO without SQL in Core", async () => {
    const core = await import("@gafus/core/services/rewardedCredits");
    await import("./install-core-settings");
    const result = await core.getRewardedAdSettings();
    expect(mock.read).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      androidEnabled: false, iosEnabled: false, dailyAdLimit: 1,
      yandexAndroidPlacementId: null, yandexIosPlacementId: null,
      testMode: true,
    });
    await core.updateRewardedAdSettings({ dailyAdLimit: 3 }, "admin-1");
    expect(mock.write).toHaveBeenCalledWith(
      expect.objectContaining({ dailyAdLimit: 3 }),
      "admin-1",
    );
  });
});
