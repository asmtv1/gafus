import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasWalkLocationAccess, requestWalkLocationAccess } from "./walkLocationPermissionFlow";

const native = vi.hoisted(() => ({
  platform: { OS: "android", Version: 30 },
  services: vi.fn(),
  foreground: vi.fn(),
  background: vi.fn(),
  requestForeground: vi.fn(),
  requestBackground: vi.fn(),
  openSettings: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock("expo-location", () => ({
  hasServicesEnabledAsync: native.services,
  getForegroundPermissionsAsync: native.foreground,
  getBackgroundPermissionsAsync: native.background,
  requestForegroundPermissionsAsync: native.requestForeground,
  requestBackgroundPermissionsAsync: native.requestBackground,
}));
vi.mock("react-native", () => ({
  Platform: native.platform,
  AppState: { addEventListener: native.addListener },
  Linking: { openSettings: native.openSettings },
}));

const granted = { granted: true, canAskAgain: true };
const denied = { granted: false, canAskAgain: true };
const blocked = { granted: false, canAskAgain: false };
const confirm = vi.fn();
let signal: AbortSignal;
let onState: ((state: string) => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  native.platform.OS = "android";
  native.platform.Version = 30;
  signal = new AbortController().signal;
  onState = undefined;
  confirm.mockResolvedValue(true);
  native.services.mockResolvedValue(true);
  native.foreground.mockResolvedValue(denied);
  native.background.mockResolvedValue(denied);
  native.requestForeground.mockImplementation(async () => {
    native.foreground.mockResolvedValue(granted);
    return granted;
  });
  native.requestBackground.mockImplementation(async () => {
    native.background.mockResolvedValue(granted);
    return granted;
  });
  native.addListener.mockImplementation((_event, callback) => {
    onState = callback;
    return { remove: native.removeListener };
  });
});

const request = (isCurrent = () => true) =>
  requestWalkLocationAccess({ confirm, isCurrent, signal });

describe("walk location permissions", () => {
  it.each([
    [29, "permission"],
    [30, "background-settings"],
  ])("waits for disclosure before sequential native requests on API %i", async (version, details) => {
    native.platform.Version = version;
    let answer!: (confirmed: boolean) => void;
    confirm.mockImplementation(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    const result = request();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(details));
    expect(native.requestForeground).not.toHaveBeenCalled();
    expect(native.requestBackground).not.toHaveBeenCalled();
    answer(true);
    expect(await result).toBe(true);
    expect(native.requestForeground.mock.invocationCallOrder[0]).toBeLessThan(
      native.requestBackground.mock.invocationCallOrder[0]!,
    );
  });

  it("does not open any system UI when the user dismisses disclosure", async () => {
    confirm.mockResolvedValue(false);
    expect(await request()).toBe(false);
    expect(native.requestForeground).not.toHaveBeenCalled();
    expect(native.requestBackground).not.toHaveBeenCalled();
    expect(native.openSettings).not.toHaveBeenCalled();
  });

  it("does not request background access after foreground denial", async () => {
    native.requestForeground.mockResolvedValue(denied);
    expect(await request()).toBe(false);
    expect(native.requestBackground).not.toHaveBeenCalled();
  });

  it("uses the current permission after settings, even if the native request returns granted", async () => {
    native.foreground.mockResolvedValue(granted);
    native.requestBackground.mockResolvedValue(granted);
    expect(await request()).toBe(false);
    expect(native.requestForeground).not.toHaveBeenCalled();
    expect(native.requestBackground).toHaveBeenCalledOnce();
    expect(native.background).toHaveBeenCalledTimes(3);
    expect(native.openSettings).not.toHaveBeenCalled();
  });

  it.each([granted, denied])("reads the real settings outcome when access was blocked (%o)", async (outcome) => {
    native.foreground.mockResolvedValue(granted);
    native.background.mockResolvedValue(blocked);
    const result = request();
    await vi.waitFor(() => expect(native.openSettings).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith("app-settings");
    onState?.("active");
    expect(native.background).toHaveBeenCalledOnce();
    onState?.("background");
    native.background.mockResolvedValue(outcome);
    onState?.("active");
    expect(await result).toBe(outcome.granted);
    expect(native.requestBackground).not.toHaveBeenCalled();
    expect(native.removeListener).toHaveBeenCalledOnce();
  });

  it("cancels a pending return from settings when the screen is disposed", async () => {
    const controller = new AbortController();
    signal = controller.signal;
    native.foreground.mockResolvedValue(blocked);
    const result = request();
    await vi.waitFor(() => expect(native.openSettings).toHaveBeenCalledOnce());
    controller.abort();
    expect(await result).toBe(false);
    expect(native.removeListener).toHaveBeenCalledOnce();
  });

  it("skips disclosure and requests when both permissions are already granted", async () => {
    native.foreground.mockResolvedValue(granted);
    native.background.mockResolvedValue(granted);
    expect(await request()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(native.requestForeground).not.toHaveBeenCalled();
    expect(native.requestBackground).not.toHaveBeenCalled();
  });

  it("never prompts during a read-only check for an existing walk", async () => {
    expect(await hasWalkLocationAccess()).toBe(false);
    expect(native.requestForeground).not.toHaveBeenCalled();
    expect(native.requestBackground).not.toHaveBeenCalled();
  });

  it("drops an in-flight confirmation from a former walk or account", async () => {
    let current = true;
    confirm.mockImplementation(async () => {
      current = false;
      return true;
    });
    expect(await request(() => current)).toBe(false);
    expect(native.requestForeground).not.toHaveBeenCalled();
  });

  it("keeps iOS native prompts without an Android disclosure", async () => {
    native.platform.OS = "ios";
    expect(await request()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(native.requestForeground).toHaveBeenCalledOnce();
    expect(native.requestBackground).toHaveBeenCalledOnce();
  });
});
