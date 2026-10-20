import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getExpoPushToken: vi.fn(),
  setChannel: vi.fn(),
  getRustoreToken: vi.fn(),
  saveSubscription: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  report: vi.fn(),
}));

vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { appOwnership: "standalone", expoConfig: { extra: { eas: { projectId: "test" } } } },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: { RustorePush: { getToken: mock.getRustoreToken } },
}));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mock.getPermissions,
  requestPermissionsAsync: mock.requestPermissions,
  getExpoPushTokenAsync: mock.getExpoPushToken,
  setNotificationChannelAsync: mock.setChannel,
  setNotificationHandler: vi.fn(),
  AndroidImportance: { MAX: 5 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mock.storageGet, setItem: mock.storageSet },
}));
vi.mock("@/shared/lib/api", () => ({
  subscriptionsApi: { savePushSubscription: mock.saveSubscription },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mock.report }));

import {
  refreshAndroidPushRegistration,
  setDevicePushDisabled,
  setupPushNotifications,
} from "./notifications";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mock.storageGet.mockResolvedValue("0");
  mock.storageSet.mockResolvedValue(undefined);
  mock.getPermissions.mockResolvedValue({ status: "granted" });
  mock.getExpoPushToken.mockResolvedValue({ data: "ExponentPushToken[mobile-test]" });
  mock.getRustoreToken.mockResolvedValue("rustore-test-token");
  mock.saveSubscription.mockResolvedValue({ success: true });
  mock.setChannel.mockResolvedValue(undefined);
});

afterEach(() => { vi.restoreAllMocks(); });

describe("Android push registration lifecycle", () => {
  it("restores both native channels for a signed-in user with OS permission", async () => {
    expect(await refreshAndroidPushRegistration("trainer-1")).toBe(true);
    expect(mock.saveSubscription).toHaveBeenCalledWith({
      endpoint: "ExponentPushToken[mobile-test]",
      keys: { p256dh: "expo", auth: "expo" },
    });
    expect(mock.saveSubscription).toHaveBeenCalledWith({
      endpoint: "rustore-test-token",
      keys: { p256dh: "rustore", auth: "rustore" },
    });
  });

  it("still registers RuStore when Expo token acquisition fails", async () => {
    mock.getExpoPushToken.mockRejectedValue(new Error("FCM unavailable"));
    expect(await setupPushNotifications()).toBe(true);
    expect(mock.saveSubscription).toHaveBeenCalledTimes(1);
    expect(mock.saveSubscription).toHaveBeenCalledWith({
      endpoint: "rustore-test-token",
      keys: { p256dh: "rustore", auth: "rustore" },
    });
  });

  it("does not request permissions or send tokens when OS permission is denied", async () => {
    mock.getPermissions.mockResolvedValue({ status: "denied" });
    expect(await refreshAndroidPushRegistration("trainer-1")).toBe(false);
    expect(mock.requestPermissions).not.toHaveBeenCalled();
    expect(mock.saveSubscription).not.toHaveBeenCalled();
  });

  it("does not re-enable notification subscriptions on legacy installs without an explicit opt-in", async () => {
    mock.storageGet.mockResolvedValue(null);
    expect(await refreshAndroidPushRegistration("trainer-1")).toBe(false);
    expect(mock.saveSubscription).not.toHaveBeenCalled();
  });

  it("honors explicit per-account opt-out on this device", async () => {
    await setDevicePushDisabled("trainer-1", true);
    expect(mock.storageSet).toHaveBeenCalledWith(
      "gafus:push-disabled-for-user:v1:trainer-1", "1",
    );
    mock.storageGet.mockResolvedValue("1");
    expect(await refreshAndroidPushRegistration("trainer-1")).toBe(false);
    expect(mock.getPermissions).not.toHaveBeenCalled();
    expect(mock.saveSubscription).not.toHaveBeenCalled();
  });

  it("does not register duplicate tokens during concurrent app-resume events", async () => {
    let release!: (value: string) => void;
    mock.storageGet.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const a = refreshAndroidPushRegistration("trainer-1");
    const b = refreshAndroidPushRegistration("trainer-1");
    // Registration is held by the preference lookup; the second call shares it.
    release("0");
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(mock.saveSubscription).toHaveBeenCalledTimes(2);
  });

  it("does not claim success when neither Android transport registers", async () => {
    mock.getExpoPushToken.mockRejectedValue(new Error("FCM unavailable"));
    mock.getRustoreToken.mockRejectedValue(new Error("RuStore unavailable"));
    expect(await setupPushNotifications()).toBe(false);
    expect(mock.saveSubscription).not.toHaveBeenCalled();
  });
});
