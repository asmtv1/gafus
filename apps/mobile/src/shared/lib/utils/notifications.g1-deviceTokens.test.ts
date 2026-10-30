import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  nativeModules: { RustorePush: { getToken: vi.fn() } },
  device: { isDevice: true },
  constants: {
    appOwnership: "standalone",
    expoConfig: { extra: { eas: { projectId: "ag3-project" } } },
    easConfig: { projectId: "ag3-project" },
  },
  getPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: mocks.platform,
  NativeModules: mocks.nativeModules,
}));
vi.mock("expo-device", () => ({
  get isDevice() {
    return mocks.device.isDevice;
  },
}));
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mocks.getPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({
  subscriptionsApi: { savePushSubscription: vi.fn() },
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: false, isLoading: false, user: null }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => null },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: mocks.reportClientError,
}));

import { getCurrentDeviceTokens } from "./notifications";

describe("AG3-NOTIF-050 push current-device token fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform.OS = "android";
    mocks.device.isDevice = true;
    mocks.constants.appOwnership = "standalone";
    mocks.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: "expo-device-token" });
    mocks.nativeModules.RustorePush.getToken.mockResolvedValue("rustore-device-token");
  });

  it("continues collecting the Android RuStore token when Expo permissions lookup rejects", async () => {
    mocks.getPermissionsAsync.mockRejectedValue(new Error("Expo permission provider unavailable"));

    await expect(getCurrentDeviceTokens()).resolves.toEqual({
      rustore: "rustore-device-token",
    });
    expect(mocks.nativeModules.RustorePush.getToken).toHaveBeenCalledOnce();
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mocks.reportClientError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        issueKey: "PushNotifications",
        keys: { operation: "get_current_device_tokens" },
      }),
    );
  });

  it("returns no token instead of rejecting when iOS Expo permissions lookup rejects", async () => {
    mocks.platform.OS = "ios";
    mocks.getPermissionsAsync.mockRejectedValue(new Error("Native bridge unavailable"));

    await expect(getCurrentDeviceTokens()).resolves.toEqual({});
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
    expect(mocks.reportClientError).toHaveBeenCalledOnce();
  });

  it("returns Expo and RuStore tokens when both Android providers are available", async () => {
    await expect(getCurrentDeviceTokens()).resolves.toEqual({
      expo: "expo-device-token",
      rustore: "rustore-device-token",
    });
    expect(mocks.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: "ag3-project",
    });
    expect(mocks.reportClientError).not.toHaveBeenCalled();
  });

  it("still collects RuStore when Expo notifications are denied", async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: "denied" });

    await expect(getCurrentDeviceTokens()).resolves.toEqual({
      rustore: "rustore-device-token",
    });
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("does not request tokens in Expo Go", async () => {
    mocks.constants.appOwnership = "expo";

    await expect(getCurrentDeviceTokens()).resolves.toEqual({});
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
  });

  it("does not request tokens on a simulator", async () => {
    mocks.device.isDevice = false;

    await expect(getCurrentDeviceTokens()).resolves.toEqual({});
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
  });
});
