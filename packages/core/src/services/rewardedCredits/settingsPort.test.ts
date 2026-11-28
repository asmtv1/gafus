import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());

function ports() {
  return {
    readRewardedAdSettingsRow: vi.fn(async () => null),
    writeRewardedAdSettingsRow: vi.fn(async (row: {
      androidEnabled: boolean;
      iosEnabled: boolean;
      dailyAdLimit: number;
      yandexAndroidPlacementId: string | null;
      yandexIosPlacementId: string | null;
      testMode: boolean;
    }) => row),
  };
}

describe("Core rewarded settings Persistence port", () => {
  it("fails closed when no adapter is composed", async () => {
    const {createRewardedSettingsService}=await import("./settingsService");
    expect(()=>createRewardedSettingsService(undefined as never,async()=>false)).toThrow("REWARDED_SETTINGS_DEPENDENCIES_REQUIRED");
  });

  it("preserves missing-DB-row defaults while using the installed SQL adapter", async () => {
    const {createRewardedSettingsService}=await import("./settingsService");
    const adapter = ports();
    const mod=createRewardedSettingsService(adapter as never,async()=>false);
    const settings = await mod.getRewardedAdSettings();
    expect(adapter.readRewardedAdSettingsRow).toHaveBeenCalledTimes(1);
    expect(settings).toMatchObject({
      androidEnabled: false, iosEnabled: false, dailyAdLimit: 1, testMode: true,
    });
    await expect(mod.resolveRewardedPlatformSettings("ANDROID")).resolves.toMatchObject({
      platformEnabled: false, placementId: "demo-rewarded-yandex", testMode: true,
    });
  });

  it("keeps invalid limits and missing production placement errors unchanged", async () => {
    const {createRewardedSettingsService}=await import("./settingsService");
    const adapter = ports();
    const mod=createRewardedSettingsService(adapter as never,async()=>false);
    await expect(mod.updateRewardedAdSettings({ dailyAdLimit: 101 }, "admin"))
      .rejects.toThrow("dailyAdLimit must be an integer between 0 and 100");
    await expect(mod.updateRewardedAdSettings({ androidEnabled: true, testMode: false }, "admin"))
      .rejects.toThrow("placement id is required before enabling production rewarded ads");
    expect(adapter.writeRewardedAdSettingsRow).not.toHaveBeenCalled();
  });

  it("passes the actor and normalized row to the exact independent adapter", async () => {
    const {createRewardedSettingsService}=await import("./settingsService");
    const adapter = ports();
    const mod=createRewardedSettingsService(adapter as never,async()=>false);
    const other=ports();
    const independent=createRewardedSettingsService(other as never,async()=>false);
    await independent.getRewardedAdSettings();
    expect(adapter.readRewardedAdSettingsRow).not.toHaveBeenCalled();
    await mod.updateRewardedAdSettings({
      androidEnabled: true, testMode: false,
      yandexAndroidPlacementId: "  placement-prod  ",
    }, "admin-A");
    expect(adapter.writeRewardedAdSettingsRow).toHaveBeenCalledTimes(1);
    expect(adapter.writeRewardedAdSettingsRow).toHaveBeenCalledWith(
      expect.objectContaining({
        androidEnabled: true,
        testMode: false,
        dailyAdLimit: 1,
        yandexAndroidPlacementId: "placement-prod",
      }),
      "admin-A",
    );
  });
});
