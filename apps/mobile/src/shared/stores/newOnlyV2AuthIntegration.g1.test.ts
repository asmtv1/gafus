import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  secure: new Map<string, string>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  secureGet: vi.fn(),
  secureSet: vi.fn(),
  secureDelete: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
  resetUserStores: vi.fn(),
  reportError: vi.fn(),
  nextUuid: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: vi.fn(),
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.secureGet,
  setItemAsync: mocks.secureSet,
  deleteItemAsync: mocks.secureDelete,
}));
vi.mock("expo-crypto", () => ({ randomUUID: mocks.nextUuid }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/shared/lib/api", () => ({
  authApi: { login: mocks.login, logout: mocks.logout, getProfile: mocks.getProfile },
}));
vi.mock("@/shared/lib/analytics", () => ({ identifyUser: vi.fn(), resetAnalyticsUser: vi.fn() }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportError }));
vi.mock("./resetAll", () => ({ resetUserStores: mocks.resetUserStores }));
vi.mock("./galleryCleanupBridge", () => ({ clearRegisteredGallerySession: vi.fn() }));
vi.mock("@/shared/lib/api/mobile-intro", () => ({ trackMobileIntroAuthOutcome: vi.fn() }));

import { useAuthStore } from "./authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { readOwnPendingPractice } from "@/shared/lib/offline/newOnlyV2PracticePending";

const A = {
  id: "USER_A",
  username: "a",
  phone: "+79990000000",
  email: "a@example.invalid",
  role: "USER" as const,
};
const B = {
  id: "USER_B",
  username: "b",
  phone: "+79990000001",
  email: "b@example.invalid",
  role: "USER" as const,
};
const epochs = [
  "51e35071-0752-4f22-b3aa-23f8844c8931",
  "8ae52e9a-580f-4ab8-9545-397973bc32f5",
  "d8f37921-b880-4b04-ae14-96c2e749b029",
  "5639c98f-7140-4846-87f7-283a40ae1906",
];

describe("AG3-OFF021 Phase1 native adapter + verified auth lifecycle", () => {
  beforeEach(async () => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    mocks.kv.clear();
    mocks.secure.clear();
    mocks.getItem.mockImplementation(async (key: string) => mocks.kv.get(key) ?? null);
    mocks.setItem.mockImplementation(async (key: string, value: string) => {
      mocks.kv.set(key, value);
    });
    mocks.secureGet.mockImplementation(async (key: string) => mocks.secure.get(key) ?? null);
    mocks.secureSet.mockImplementation(async (key: string, value: string) => {
      mocks.secure.set(key, value);
    });
    mocks.secureDelete.mockImplementation(async (key: string) => {
      mocks.secure.delete(key);
    });
    const ids = [...epochs];
    mocks.nextUuid.mockImplementation(() => {
      const value = ids.shift();
      if (!value) throw new Error("No fixture UUID");
      return value;
    });
    mocks.login.mockResolvedValue({
      success: true,
      data: { accessToken: "token", refreshToken: "refresh" },
    });
    mocks.logout.mockResolvedValue({ success: true });
    mocks.getProfile.mockResolvedValue({ success: true, data: A });
    await newOnlyV2NativeQueues.endSession();
    await useAuthStore.persist.rehydrate();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  it("routes verified login A to owner/epoch queue, then login B without adopting A and never rewrites legacy", async () => {
    const old = {
      "progress-sync-storage": "{historic_queue_unknown_owner}",
      "prevention-sync-storage": "{historic_prevention_unknown_owner}",
      "offline-storage": "{historic_media_unknown_owner}",
    };
    for (const [key, raw] of Object.entries(old)) mocks.kv.set(key, raw);
    await expect(useAuthStore.getState().login("a", "fakepass")).resolves.toEqual({
      success: true,
    });
    const binding = JSON.parse(mocks.secure.get("gafus-v2-auth-binding")!);
    expect(binding).toMatchObject({
      schemaVersion: 2,
      principalId: "USER_A",
      authEpoch: epochs[0],
    });
    const first = await newOnlyV2NativeQueues.enqueue("progress", "startStep", {
      courseId: "course-A",
    });
    expect(first.eventId).toBe(epochs[1]);
    const aKey = "gafus-progress-v2:USER_A:" + epochs[0];
    const rawA = mocks.kv.get(aKey);
    expect(rawA).toContain(first.eventId);

    await useAuthStore.getState().logout();
    await vi.waitFor(() => expect(mocks.secure.has("gafus-v2-auth-binding")).toBe(false));
    expect(newOnlyV2NativeQueues.getVerifiedBinding()).toBeNull();
    expect(mocks.kv.get(aKey)).toBe(rawA);

    mocks.getProfile.mockResolvedValueOnce({ success: true, data: B });
    await expect(useAuthStore.getState().login("b", "fakepass")).resolves.toEqual({
      success: true,
    });
    expect(newOnlyV2NativeQueues.getVerifiedBinding()).toMatchObject({
      principalId: "USER_B",
      authEpoch: epochs[2],
    });
    expect(await newOnlyV2NativeQueues.getPending("progress")).toEqual([]);
    expect(mocks.kv.get(aKey)).toBe(rawA);
    for (const [key, raw] of Object.entries(old)) expect(mocks.kv.get(key)).toBe(raw);
    expect(mocks.setItem.mock.calls.map((call) => call[0])).not.toContain("progress-sync-storage");
    expect(mocks.setItem.mock.calls.map((call) => call[0])).not.toContain(
      "prevention-sync-storage",
    );
  });

  it("preserves epoch across refresh and verified restart, rotates at same-user new login and fences pending UI", async () => {
    await expect(useAuthStore.getState().login("a", "fakepass")).resolves.toEqual({
      success: true,
    });
    const firstEpoch = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch;
    expect(firstEpoch).toBe(epochs[0]);
    await newOnlyV2NativeQueues.enqueue("progress", "completePracticeStep", {
      courseId: "courseA",
      dayOnCourseId: "dayA",
      stepIndex: 0,
    });
    const ownerPending = () =>
      readOwnPendingPractice(newOnlyV2NativeQueues, "USER_A", "courseA", "dayA");
    expect(await ownerPending()).toHaveLength(1);
    // Refresh reattests the *same* session; no new epoch and no queue invalidation.
    expect(await newOnlyV2NativeQueues.revalidateSameSession("USER_A")).toBe(true);
    expect(newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch).toBe(firstEpoch);
    expect(await ownerPending()).toHaveLength(1);
    // Verified restart restores SecureStore binding, retaining same AsyncStorage queue.
    expect(await newOnlyV2NativeQueues.restoreVerifiedSession("USER_A")).toBe(true);
    expect(newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch).toBe(firstEpoch);
    expect(await ownerPending()).toHaveLength(1);
    const oldKey = `gafus-progress-v2:USER_A:${firstEpoch}`;
    const oldBytes = mocks.kv.get(oldKey);
    await useAuthStore.getState().logout();
    await vi.waitFor(() => expect(newOnlyV2NativeQueues.getVerifiedBinding()).toBeNull());
    expect(await ownerPending()).toEqual([]);
    await expect(useAuthStore.getState().login("a", "fakepass")).resolves.toEqual({
      success: true,
    });
    const secondEpoch = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch;
    expect(secondEpoch).toBe(epochs[2]);
    expect(secondEpoch).not.toBe(firstEpoch);
    expect(await ownerPending()).toEqual([]);
    expect(mocks.kv.get(oldKey)).toBe(oldBytes);
  });

  it("fails closed for v2 if SecureStore epoch cannot be persisted, without failing ordinary login", async () => {
    mocks.secureSet.mockImplementation(async (key: string, value: string) => {
      if (key === "gafus-v2-auth-binding") throw new Error("secure-write-unavailable");
      mocks.secure.set(key, value);
    });
    await expect(useAuthStore.getState().login("a", "fakepass")).resolves.toEqual({
      success: true,
    });
    expect(newOnlyV2NativeQueues.getVerifiedBinding()).toBeNull();
    await expect(newOnlyV2NativeQueues.enqueue("progress", "startStep", {})).rejects.toMatchObject({
      code: "V2_SESSION_UNVERIFIED",
    });
    expect(mocks.reportError).toHaveBeenCalled();
    expect(mocks.kv.has("gafus-progress-v2:USER_A:" + epochs[0])).toBe(false);
  });
});
