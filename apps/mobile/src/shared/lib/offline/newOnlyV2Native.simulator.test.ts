import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  get: vi.fn(), set: vi.fn(), del: vi.fn(),
  nativeGet: vi.fn(), nativeSet: vi.fn(), nativeDelete: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/shared/lib/authTokenStorage", () => ({ authTokenStorage: {
  getItemAsync: mocks.get, setItemAsync: mocks.set, deleteItemAsync: mocks.del,
} }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.nativeGet, setItemAsync: mocks.nativeSet,
  deleteItemAsync: mocks.nativeDelete,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "51e35071-0752-4f22-b3aa-23f8844c8931" }));

import { newOnlyV2NativeQueues } from "./newOnlyV2Native";

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.secure.clear();
  mocks.get.mockImplementation(async (key: string) => mocks.secure.get(key) ?? null);
  mocks.set.mockImplementation(async (key: string, value: string) => {
    mocks.secure.set(key, value);
  });
  mocks.del.mockImplementation(async (key: string) => { mocks.secure.delete(key); });
  mocks.nativeGet.mockRejectedValue(new Error("simulator keychain unavailable"));
  mocks.nativeSet.mockRejectedValue(new Error("simulator keychain unavailable"));
  mocks.nativeDelete.mockRejectedValue(new Error("simulator keychain unavailable"));
  await newOnlyV2NativeQueues.endSession();
  vi.clearAllMocks();
});

describe("iOS simulator V2 session persistence", () => {
  it("creates and restores the verified session without touching a broken native Keychain", async () => {
    const initial = await newOnlyV2NativeQueues.beginVerifiedLogin("USER_A");
    expect(initial.principalId).toBe("USER_A");
    expect(mocks.secure.has("gafus-v2-auth-binding")).toBe(true);
    expect(await newOnlyV2NativeQueues.restoreVerifiedSession("USER_A")).toBe(true);
    expect(newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch).toBe(initial.authEpoch);
    expect(mocks.nativeGet).not.toHaveBeenCalled();
    expect(mocks.nativeSet).not.toHaveBeenCalled();
    expect(mocks.nativeDelete).not.toHaveBeenCalled();
  });
});
