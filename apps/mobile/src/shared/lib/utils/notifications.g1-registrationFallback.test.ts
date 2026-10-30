import { beforeEach, describe, expect, it, vi } from "vitest";
let epochCounter = 0;

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
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  savePushSubscription: vi.fn(),
  reportClientError: vi.fn(),
  epoch: "TEST-EPOCH",
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
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  setNotificationHandler: mocks.setNotificationHandler,
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  AndroidImportance: { MAX: 5 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({
  subscriptionsApi: { savePushSubscription: mocks.savePushSubscription },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: mocks.reportClientError,
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ isAuthenticated: true, isLoading: false, user: { id: "test-owner" } }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: "test-owner", authEpoch: mocks.epoch }),
  },
}));

import { setupPushNotifications } from "./notifications";

describe("AG3-NOTIF-050 push registration fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.epoch = `TEST-${++epochCounter}`;
    mocks.setNotificationHandler.mockReset();
    mocks.platform.OS = "android";
    mocks.device.isDevice = true;
    mocks.constants.appOwnership = "standalone";
    mocks.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: "expo-device-token" });
    mocks.nativeModules.RustorePush.getToken.mockResolvedValue("rustore-device-token");
    mocks.savePushSubscription.mockResolvedValue({ success: true });
  });

  it("registers RuStore on Android when Expo permission lookup fails", async () => {
    mocks.getPermissionsAsync.mockRejectedValue(new Error("Expo permissions bridge unavailable"));

    await expect(setupPushNotifications()).resolves.toBe(true);
    expect(mocks.nativeModules.RustorePush.getToken).toHaveBeenCalledOnce();
    expect(mocks.savePushSubscription).toHaveBeenCalledExactlyOnceWith(
      {
        endpoint: "rustore-device-token",
        keys: { p256dh: "rustore", auth: "rustore" },
      },
      expect.any(Function),
    );
    expect(mocks.reportClientError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      }),
    );
  });

  it("registers RuStore when requesting Expo permission fails", async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mocks.requestPermissionsAsync.mockRejectedValue(new Error("Native prompt unavailable"));

    await expect(setupPushNotifications()).resolves.toBe(true);
    expect(mocks.savePushSubscription).toHaveBeenCalledExactlyOnceWith(
      {
        endpoint: "rustore-device-token",
        keys: { p256dh: "rustore", auth: "rustore" },
      },
      expect.any(Function),
    );
  });

  it("continues RuStore when the Expo notification handler throws", async () => {
    mocks.setNotificationHandler.mockImplementation(() => {
      throw new Error("Notifications setup failed");
    });

    await expect(setupPushNotifications()).resolves.toBe(true);
    expect(mocks.nativeModules.RustorePush.getToken).toHaveBeenCalledOnce();
    expect(mocks.savePushSubscription).toHaveBeenCalledOnce();
  });

  it("registers both Expo and RuStore when available on Android", async () => {
    await expect(setupPushNotifications()).resolves.toBe(true);
    expect(mocks.savePushSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.savePushSubscription).toHaveBeenCalledWith(
      {
        endpoint: "expo-device-token",
        keys: { p256dh: "expo", auth: "expo" },
      },
      expect.any(Function),
    );
    expect(mocks.savePushSubscription).toHaveBeenCalledWith(
      {
        endpoint: "rustore-device-token",
        keys: { p256dh: "rustore", auth: "rustore" },
      },
      expect.any(Function),
    );
  });

  it("does not register RuStore on iOS when Expo provider fails", async () => {
    mocks.platform.OS = "ios";
    mocks.getPermissionsAsync.mockRejectedValue(new Error("Permission bridge unavailable"));

    await expect(setupPushNotifications()).resolves.toBe(false);
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
    expect(mocks.savePushSubscription).not.toHaveBeenCalled();
  });

  it("does not register native push providers in Expo Go", async () => {
    mocks.constants.appOwnership = "expo";
    await expect(setupPushNotifications()).resolves.toBe(false);
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.savePushSubscription).not.toHaveBeenCalled();
  });

  it("does not register RuStore on an Android simulator", async () => {
    mocks.device.isDevice = false;
    await expect(setupPushNotifications()).resolves.toBe(false);
    expect(mocks.nativeModules.RustorePush.getToken).not.toHaveBeenCalled();
    expect(mocks.savePushSubscription).not.toHaveBeenCalled();
  });
});
