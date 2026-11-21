import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  os: "ios",
  isDevice: false,
  secureGet: vi.fn(),
  secureSet: vi.fn(),
  secureDelete: vi.fn(),
  asyncGet: vi.fn(),
  asyncSet: vi.fn(),
  asyncDelete: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { get OS() { return state.os; } } }));
vi.mock("expo-device", () => ({ get isDevice() { return state.isDevice; } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: state.secureGet,
  setItemAsync: state.secureSet,
  deleteItemAsync: state.secureDelete,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: state.asyncGet,
    setItem: state.asyncSet,
    removeItem: state.asyncDelete,
  },
}));

async function loadStorage(os: string, isDevice: boolean) {
  state.os = os;
  state.isDevice = isDevice;
  vi.resetModules();
  return (await import("./authTokenStorage.ios")).authTokenStorage;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.asyncGet.mockResolvedValue("sim-token");
  state.secureGet.mockResolvedValue("device-token");
  state.asyncSet.mockResolvedValue(undefined);
  state.secureSet.mockResolvedValue(undefined);
  state.asyncDelete.mockResolvedValue(undefined);
  state.secureDelete.mockResolvedValue(undefined);
});

describe("auth token storage platform isolation", () => {
  it("uses namespaced AsyncStorage exclusively on iOS Simulator", async () => {
    const storage = await loadStorage("ios", false);
    expect(await storage.getItemAsync("auth_token")).toBe("sim-token");
    await storage.setItemAsync("refresh_token", "secret");
    await storage.deleteItemAsync("auth_token");
    expect(state.asyncGet).toHaveBeenCalledWith("@gafus/ios-simulator/auth/auth_token");
    expect(state.asyncSet).toHaveBeenCalledWith("@gafus/ios-simulator/auth/refresh_token", "secret");
    expect(state.asyncDelete).toHaveBeenCalledWith("@gafus/ios-simulator/auth/auth_token");
    expect(state.secureGet).not.toHaveBeenCalled();
    expect(state.secureSet).not.toHaveBeenCalled();
    expect(state.secureDelete).not.toHaveBeenCalled();
  });

  it.each([ ["ios", true], ["android", false], ["android", true] ] as const)(
    "uses SecureStore only on %s with isDevice=%s",
    async (os, isDevice) => {
      const storage = await loadStorage(os, isDevice);
      expect(await storage.getItemAsync("auth_token")).toBe("device-token");
      await storage.setItemAsync("refresh_token", "secret");
      await storage.deleteItemAsync("auth_token");
      expect(state.secureGet).toHaveBeenCalledWith("auth_token");
      expect(state.secureSet).toHaveBeenCalledWith("refresh_token", "secret");
      expect(state.secureDelete).toHaveBeenCalledWith("auth_token");
      expect(state.asyncGet).not.toHaveBeenCalled();
      expect(state.asyncSet).not.toHaveBeenCalled();
      expect(state.asyncDelete).not.toHaveBeenCalled();
    },
  );
});
