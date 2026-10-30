import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  device: { isDevice: true },
  constants: {
    appOwnership: "standalone",
    expoConfig: { extra: { eas: { projectId: "offline-push-test" } } },
    easConfig: { projectId: "offline-push-test" },
  },
  order: [] as string[],
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  reportClientError: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: mocks.platform,
  NativeModules: {},
}));
vi.mock("expo-device", () => ({ get isDevice() { return mocks.device.isDevice; } }));
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: mocks.setNotificationHandler,
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  AndroidImportance: { MAX: 5 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({
  subscriptionsApi: { savePushSubscription: vi.fn() },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: mocks.reportClientError,
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({
    isAuthenticated: true, isLoading: false, user: { id: "owner" },
  }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: "owner", authEpoch: "epoch-A" }),
  },
}));
import { registerForPushNotifications } from "./notifications";

describe("Android 13+ Expo channel readiness", () => {
  beforeEach(() => {
    mocks.platform.OS = "android";
    mocks.device.isDevice = true;
    mocks.constants.appOwnership = "standalone";
    mocks.order.length = 0;
    vi.clearAllMocks();
    mocks.setNotificationChannelAsync.mockImplementation(async () => {
      mocks.order.push("channel");
      return { id: "default" };
    });
    mocks.getPermissionsAsync.mockImplementation(async () => {
      mocks.order.push("permissions");
      return { status: "undetermined" };
    });
    mocks.requestPermissionsAsync.mockImplementation(async () => {
      mocks.order.push("request");
      return { status: "granted" };
    });
    mocks.getExpoPushTokenAsync.mockImplementation(async () => {
      mocks.order.push("token");
      return { data: "ExpoPushToken[synthetic]" };
    });
  });

  it("creates the default Android channel before prompting and requesting a token", async () => {
    await expect(registerForPushNotifications()).resolves.toBe("ExpoPushToken[synthetic]");
    expect(mocks.order).toEqual(["channel", "permissions", "request", "token"]);
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ importance: 5 }),
    );
  });

  it("fails closed if Android channel registration itself fails", async () => {
    mocks.setNotificationChannelAsync.mockRejectedValueOnce(new Error("channel unavailable"));
    await expect(registerForPushNotifications()).resolves.toBeNull();
    expect(mocks.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mocks.reportClientError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      }),
    );
  });

  it("does not create an Android channel on iOS", async () => {
    mocks.platform.OS = "ios";
    await expect(registerForPushNotifications()).resolves.toBe("ExpoPushToken[synthetic]");
    expect(mocks.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(["permissions", "request", "token"]);
  });
});
