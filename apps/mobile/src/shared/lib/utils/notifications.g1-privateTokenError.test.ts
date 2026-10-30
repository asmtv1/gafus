import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  platform: { OS: "ios" },
  device: { isDevice: true },
  constants: {
    appOwnership: "standalone",
    expoConfig: { extra: { eas: { projectId: "ag3-project" } } },
    easConfig: { projectId: "ag3-project" },
  },
  handler: vi.fn(),
  permission: vi.fn(),
  expoToken: vi.fn(),
  save: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: m.platform, NativeModules: {} }));
vi.mock("expo-device", () => ({
  get isDevice() {
    return m.device.isDevice;
  },
}));
vi.mock("expo-constants", () => ({ default: m.constants }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: m.handler,
  getPermissionsAsync: m.permission,
  getExpoPushTokenAsync: m.expoToken,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({ subscriptionsApi: { savePushSubscription: m.save } }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: false, isLoading: false, user: null }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => null },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.trace }));
import { registerForPushNotifications, savePushToken } from "./notifications";
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  m.platform.OS = "ios";
  m.permission.mockResolvedValue({ status: "granted" });
  m.expoToken.mockResolvedValue({ data: "push-token-not-to-log" });
  m.save.mockResolvedValue({ success: true });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());
describe("AG3 NOTIF050 no raw push SDK secrets in errors", () => {
  it("Expo push-token native exception is redacted before telemetry and console", async () => {
    m.expoToken.mockRejectedValueOnce(new Error("SDK failed with ExpoPushToken-PRIVATE-123"));
    expect(await registerForPushNotifications()).toBeNull();
    const events = [...m.trace.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (v instanceof Error ? v.message : JSON.stringify(v)))
      .join("|");
    expect(events).not.toContain("PRIVATE-123");
    expect(m.trace).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      }),
    );
  });
  it("push POST native transport failure does not leak endpoint in tracer or console", async () => {
    m.save.mockRejectedValueOnce(new Error("failed to save push-token-not-to-log"));
    expect(await savePushToken("push-token-not-to-log")).toBe(false);
    const events = [...m.trace.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (v instanceof Error ? v.message : JSON.stringify(v)))
      .join("|");
    expect(events).not.toContain("push-token-not-to-log");
  });
});
