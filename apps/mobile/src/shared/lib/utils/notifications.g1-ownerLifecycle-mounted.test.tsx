// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  signedIn: true,
  loading: false,
  platform: { OS: "android" },
  native: { RustorePush: { getToken: vi.fn() } },
  device: { isDevice: true },
  constants: {
    appOwnership: "standalone",
    expoConfig: { extra: { eas: { projectId: "synthetic" } } },
    easConfig: { projectId: "synthetic" },
  },
  permissions: vi.fn(),
  expo: vi.fn(),
  handler: vi.fn(),
  channel: vi.fn(),
  save: vi.fn(),
  trace: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: m.platform, NativeModules: m.native }));
vi.mock("expo-device", () => ({
  get isDevice() {
    return m.device.isDevice;
  },
}));
vi.mock("expo-constants", () => ({ default: m.constants }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: m.handler,
  getPermissionsAsync: m.permissions,
  requestPermissionsAsync: m.permissions,
  getExpoPushTokenAsync: m.expo,
  setNotificationChannelAsync: m.channel,
  AndroidImportance: { MAX: 5 },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({ subscriptionsApi: { savePushSubscription: m.save } }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: m.trace }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.signedIn,
      isLoading: m.loading,
      user: m.signedIn ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.signedIn ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
import { setupPushNotifications } from "./notifications";
import { usePushRegistrationLiveness } from "./usePushRegistrationLiveness";
const inFlight: Promise<boolean>[] = [];
function Harness() {
  const isLive = usePushRegistrationLiveness();
  return createElement(
    "button",
    {
      onClick: () => {
        inFlight.push(setupPushNotifications({ isLive }));
      },
    },
    "register",
  );
}
function delay<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
let counter = 0;
async function flush() {
  await act(async () => {
    for (let k = 0; k < 15; k++) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => root.render(createElement(Harness)));
}
async function click() {
  await act(async () => host.querySelector("button")?.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  inFlight.length = 0;
  m.expo.mockReset();
  m.native.RustorePush.getToken.mockReset();
  m.save.mockReset();
  m.owner = "A";
  m.epoch = "E" + ++counter;
  m.signedIn = true;
  m.loading = false;
  m.platform.OS = "android";
  m.device.isDevice = true;
  m.constants.appOwnership = "standalone";
  m.permissions.mockResolvedValue({ status: "granted" });
  m.expo.mockResolvedValue({ data: "expo-device-token" });
  m.native.RustorePush.getToken.mockResolvedValue("rustore-device-token");
  m.save.mockImplementation(async (_data: unknown, guard: () => boolean) => ({ success: guard() }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await Promise.all(inFlight);
  await act(async () => root.unmount());
  host.remove();
});
describe("mounted push SDK to API actor guard, synthetic only", () => {
  it("logout while Expo token pending prevents POST", async () => {
    m.platform.OS = "ios";
    const d = delay<{ data: string }>();
    m.expo.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledTimes(1));
    m.signedIn = false;
    await act(async () => d.resolve({ data: "secret-expo-A" }));
    await flush();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("unmount while native token pending prevents POST", async () => {
    m.platform.OS = "ios";
    const d = delay<{ data: string }>();
    m.expo.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledTimes(1));
    await act(async () => root.unmount());
    await act(async () => d.resolve({ data: "secret-unmounted" }));
    await flush();
    expect(m.save).not.toHaveBeenCalled();
    root = createRoot(host);
  });
  it("A to B to A-new-epoch discards old callback; new A can register", async () => {
    m.platform.OS = "ios";
    const d = delay<{ data: string }>();
    m.expo.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledTimes(1));
    m.owner = "B";
    m.epoch = "B-NEW";
    m.owner = "A";
    m.epoch = "A-SECOND-" + counter;
    await act(async () => d.resolve({ data: "secret-old-A" }));
    await flush();
    expect(m.save).not.toHaveBeenCalled();
    await click();
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.save.mock.calls[0][0]).toMatchObject({ endpoint: "expo-device-token" });
  });
  it("RuStore token fetched after switching account cannot POST", async () => {
    m.expo.mockResolvedValue({ data: "" });
    const d = delay<string>();
    m.native.RustorePush.getToken.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.native.RustorePush.getToken).toHaveBeenCalledTimes(1));
    m.owner = "B";
    m.epoch = "B-NEW";
    await act(async () => d.resolve("secret-rustore-A"));
    await flush();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("rapid duplicate effect single-flight, token rotation and repeat dedup", async () => {
    m.platform.OS = "ios";
    const d = delay<{ data: string }>();
    m.expo.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.expo).toHaveBeenCalledTimes(1));
    await click();
    expect(m.expo).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ data: "expo-old" }));
    await flush();
    expect(m.save).toHaveBeenCalledTimes(1);
    await click();
    expect(m.save).toHaveBeenCalledTimes(2);
    await click();
    expect(m.save).toHaveBeenCalledTimes(2);
  });
  it("late POST ACK after logout cannot count as success for next epoch", async () => {
    m.platform.OS = "ios";
    const d = delay<{ success: boolean }>();
    m.save.mockReturnValueOnce(d.promise);
    await mount();
    await click();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
    expect(m.save).toHaveBeenCalledTimes(1);
    m.signedIn = false;
    await act(async () => d.resolve({ success: true }));
    await flush();
    m.signedIn = true;
    m.epoch = "E-NEW-" + counter;
    await click();
    expect(m.save).toHaveBeenCalledTimes(2);
  });
  it("RuStore error containing device secret is sanitized before telemetry", async () => {
    m.expo.mockResolvedValue({ data: "" });
    m.native.RustorePush.getToken.mockRejectedValueOnce(new Error("secret-device-token-123"));
    await mount();
    await click();
    const logged = m.trace.mock.calls
      .map((args: unknown[]) =>
        args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join("|"),
      )
      .join("|");
    expect(logged).not.toContain("secret-device-token-123");
    expect(m.save).not.toHaveBeenCalled();
  });
});
