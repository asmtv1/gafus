import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: { ownerId: "A", authEpoch: "E1" } as { ownerId: string; authEpoch: string } | null,
  tokens: vi.fn(),
  status: vi.fn(),
  publicProfile: vi.fn(),
}));
// Collection isolation for the unrelated V93 pets owner helper: the push-status
// query below must not eagerly import Expo SecureStore/native offline queues.
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: false, isLoading: false, user: null }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: { getVerifiedBinding: () => null },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getCurrentDeviceTokens: m.tokens,
  isSameVerifiedPushActor: (a: { ownerId: string; authEpoch: string } | null) =>
    Boolean(a && m.actor?.ownerId === a.ownerId && m.actor.authEpoch === a.authEpoch),
}));
vi.mock("./subscriptions", () => ({ subscriptionsApi: { postPushDeviceStatus: m.status } }));
vi.mock("./notes", () => ({ notesApi: { getStudentNotes: vi.fn() } }));
vi.mock("./pets", () => ({ petsApi: { getAll: vi.fn() } }));
vi.mock("./user", () => ({ userApi: {
  getProfile: vi.fn(), getPublicProfile: m.publicProfile,
} }));
import { pushDeviceStatusForActor, trainerPublicProfileQueryOptions } from "./profileTabQueries";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const A = { ownerId: "A", authEpoch: "E1" };
beforeEach(() => {
  vi.clearAllMocks();
  m.actor = { ...A };
  m.tokens.mockResolvedValue({ expo: "Expo-token" });
  m.status.mockResolvedValue({
    success: true,
    data: { determined: true, hasThisDeviceSubscription: true },
  });
});
describe("NOTIF050 owner+epoch status query is a real Mobile queryFn", () => {
  it("uses distinct keys for A/E1 B/E1 A/E2, forwards guard, returns real confirmed result", async () => {
    const b = { ownerId: "B", authEpoch: "E1" };
    const a2 = { ownerId: "A", authEpoch: "E2" };
    const opts = pushDeviceStatusForActor(A);
    expect(opts.queryKey).not.toEqual(pushDeviceStatusForActor(b).queryKey);
    expect(opts.queryKey).not.toEqual(pushDeviceStatusForActor(a2).queryKey);
    expect(await opts.queryFn()).toEqual({ determined: true, hasThisDeviceSubscription: true });
    expect(m.status).toHaveBeenCalledWith(["Expo-token"], expect.any(Function));
    expect(m.status.mock.calls[0][1]()).toBe(true);
  });
  it("A token discovery arriving after B switch must not send status POST", async () => {
    const wait = deferred<{ expo: string }>();
    m.tokens.mockReturnValueOnce(wait.promise);
    const promise = pushDeviceStatusForActor(A).queryFn();
    m.actor = { ownerId: "B", authEpoch: "E1" };
    wait.resolve({ expo: "secret-A" });
    await expect(promise).rejects.toThrow("PUSH_SESSION_CHANGED");
    expect(m.status).not.toHaveBeenCalled();
  });
  it("late status response after logout cannot materialize old owner data", async () => {
    const wait = deferred<{
      success: boolean;
      data: { determined: boolean; hasThisDeviceSubscription: boolean };
    }>();
    m.status.mockReturnValueOnce(wait.promise);
    const promise = pushDeviceStatusForActor(A).queryFn();
    await vi.waitFor(() => expect(m.status).toHaveBeenCalledOnce());
    m.actor = null;
    wait.resolve({ success: true, data: { determined: true, hasThisDeviceSubscription: true } });
    await expect(promise).rejects.toThrow("PUSH_SESSION_CHANGED");
  });
  it("network or service error remains UNKNOWN, never an inactive or active proof", async () => {
    m.status.mockResolvedValueOnce({ success: false, code: "NETWORK_ERROR" });
    await expect(pushDeviceStatusForActor(A).queryFn()).rejects.toThrow("PUSH_STATUS_UNKNOWN");
  });
});


describe("MOBILE_PROFILE_TRAINER_CODE_TRANSPORT actual trainer public read producer", () => {
  it.each(["SESSION_EXPIRED", "G05_SESSION_CHANGED"])(
    "terminal code-only %s is preserved on thrown Error even with generic server text", async code => {
      m.publicProfile.mockResolvedValueOnce({
        success: false, code, error: "Сбой чтения данных",
      });
      const options = trainerPublicProfileQueryOptions("trainer-A");
      expect(options.queryKey).toEqual(["trainer-public-profile", "trainer-A"]);
      await expect(options.queryFn()).rejects.toMatchObject({
        code, message: "Сбой чтения данных",
      });
      expect(m.publicProfile).toHaveBeenCalledWith("trainer-A");
      expect(m.publicProfile).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["NETWORK_ERROR", "UNKNOWN_READ_FAILURE"])(
    "nonterminal code %s survives without being reclassified", async code => {
      m.publicProfile.mockResolvedValueOnce({ success: false, code, error: "Недоступно" });
      await expect(trainerPublicProfileQueryOptions("trainer-A").queryFn())
        .rejects.toMatchObject({ code, message: "Недоступно" });
      expect(m.publicProfile).toHaveBeenCalledTimes(1);
    },
  );
  it("unconfirmed code-only failure has generic fallback, exact successful response untouched", async () => {
    m.publicProfile.mockResolvedValueOnce({ success: false, code: "SESSION_EXPIRED" })
      .mockResolvedValueOnce({ success: true, data: { courses: [{ id: "course-A" }] } });
    const options = trainerPublicProfileQueryOptions("trainer-A");
    await expect(options.queryFn()).rejects.toMatchObject({
      code: "SESSION_EXPIRED", message: "Ошибка загрузки профиля тренера",
    });
    await expect(options.queryFn()).resolves.toEqual({
      success: true, data: { courses: [{ id: "course-A" }] },
    });
    expect(m.publicProfile).toHaveBeenCalledTimes(2);
  });
});
