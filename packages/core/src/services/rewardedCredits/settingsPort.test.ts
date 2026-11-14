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
    const mod = await import("./settingsService");
    await expect(mod.getRewardedAdSettings())
      .rejects.toThrow("REWARDED_SETTINGS_PORT_UNBOUND");
    await expect(mod.updateRewardedAdSettings({ testMode: false }, "admin"))
      .rejects.toThrow("REWARDED_SETTINGS_PORT_UNBOUND");
    await expect(mod.resolveRewardedPlatformSettings("ANDROID"))
      .rejects.toThrow("REWARDED_SETTINGS_PORT_UNBOUND");
  });

  it("preserves missing-DB-row defaults while using the installed SQL adapter", async () => {
    const mod = await import("./settingsService");
    const adapter = ports();
    mod.registerRewardedSettingsPort(adapter);
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
    const mod = await import("./settingsService");
    const adapter = ports();
    mod.registerRewardedSettingsPort(adapter);
    await expect(mod.updateRewardedAdSettings({ dailyAdLimit: 101 }, "admin"))
      .rejects.toThrow("dailyAdLimit must be an integer between 0 and 100");
    await expect(mod.updateRewardedAdSettings({ androidEnabled: true, testMode: false }, "admin"))
      .rejects.toThrow("placement id is required before enabling production rewarded ads");
    expect(adapter.writeRewardedAdSettingsRow).not.toHaveBeenCalled();
  });

  it("passes the actor and normalized row to the exact adapter; no replacement", async () => {
    const mod = await import("./settingsService");
    const adapter = ports();
    mod.registerRewardedSettingsPort(adapter);
    mod.registerRewardedSettingsPort(adapter);
    expect(() => mod.registerRewardedSettingsPort(ports()))
      .toThrow("REWARDED_SETTINGS_PORT_ALREADY_BOUND");
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
