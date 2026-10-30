import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ owner: "A", epoch: "E1", authenticated: true, getAll: vi.fn() }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.authenticated,
      isLoading: false,
      user: m.authenticated ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.authenticated ? { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("./pets", () => ({ petsApi: { getAll: (...args: unknown[]) => m.getAll(...args) } }));
vi.mock("./notes", () => ({ notesApi: { getStudentNotes: vi.fn() } }));
vi.mock("./subscriptions", () => ({ subscriptionsApi: { postPushDeviceStatus: vi.fn() } }));
vi.mock("./user", () => ({ userApi: { getProfile: vi.fn(), getPublicProfile: vi.fn() } }));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getCurrentDeviceTokens: vi.fn(),
  isSameVerifiedPushActor: vi.fn(),
}));
import { petsQueryOptions, petListForActor, verifiedPetsActor } from "./profileTabQueries";
const pet = (overrides: Record<string, unknown> = {}) => ({
  id: "pet-A",
  ownerId: "A",
  name: "Бим",
  type: "DOG",
  breed: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
  photoUrl: null,
  showInProfile: true,
  notes: null,
  createdAt: "2026-10-21T12:00:00Z",
  ...overrides,
});
beforeEach(() => {
  m.owner = "A";
  m.epoch = "E1";
  m.authenticated = true;
  m.getAll.mockReset().mockResolvedValue({ success: true, data: [pet()] });
});
describe("AG3 V93 verified mobile shared pets GET projection (no new key)", () => {
  it("guest zero GET; must not treat guest as empty private list", async () => {
    m.authenticated = false;
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_SESSION_CHANGED");
    expect(m.getAll).not.toHaveBeenCalled();
    expect(petListForActor(undefined, null)).toBeNull();
  });
  it("valid own DOG+CAT list resolves with ownerEpoch stamp, rejects E1 cache in E2", async () => {
    m.getAll.mockResolvedValueOnce({
      success: true,
      data: [pet(), pet({ id: "cat-1", type: "CAT" })],
    });
    const result = await petsQueryOptions.queryFn();
    expect(m.getAll).toHaveBeenCalledOnce();
    expect(typeof m.getAll.mock.calls[0][0]).toBe("function");
    expect(petListForActor(result, verifiedPetsActor())).toHaveLength(2);
    m.epoch = "E2";
    expect(petListForActor(result, verifiedPetsActor())).toBeNull();
  });
  it("late A E1 GET after A->B->A E2 is rejected and does not become cache ACK", async () => {
    let resolve!: (value: unknown) => void;
    m.getAll.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = petsQueryOptions.queryFn();
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    resolve({ success: true, data: [pet({ name: "PRIVATE_A_E1" })] });
    await expect(pending).rejects.toThrow("PETS_SESSION_CHANGED");
  });
  it("401/429/500 failures never silently become an empty[]", async () => {
    for (const code of ["UNAUTHORIZED", "RATE_LIMITED", "INTERNAL_SERVER_ERROR"]) {
      m.getAll
        .mockReset()
        .mockResolvedValueOnce({ success: false, code, error: "PRIVATE backend error" });
      await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_UNAVAILABLE");
    }
  });
  it("malformed200 and foreign-owner response fail closed before caching", async () => {
    for (const data of [
      null,
      { pets: [] },
      [pet({ ownerId: "B" })],
      [pet({ type: "HORSE" })],
      [pet({ name: "" })],
      [pet({ showInProfile: "yes" })],
      [pet({ createdAt: 3 })],
    ]) {
      m.getAll.mockReset().mockResolvedValueOnce({ success: true, data });
      await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_INVALID");
    }
  });
  it("existing PetProfileVisibility cache writer spread retains owner epoch and cannot inject foreign data", async () => {
    const original = await petsQueryOptions.queryFn();
    const optimistic = {
      ...original,
      data: original.data?.map((p) => ({ ...p, showInProfile: false })),
    };
    expect(petListForActor(optimistic, verifiedPetsActor())?.[0]?.showInProfile).toBe(false);
    const foreign = { ...optimistic, data: [pet({ ownerId: "B", name: "PRIVATE_FOREIGN" })] };
    expect(petListForActor(foreign, verifiedPetsActor())).toBeNull();
    m.epoch = "E2";
    expect(petListForActor(optimistic, verifiedPetsActor())).toBeNull();
  });
  it("valid empty200 returns empty current-actor list", async () => {
    m.getAll.mockResolvedValueOnce({ success: true, data: [] });
    const result = await petsQueryOptions.queryFn();
    expect(petListForActor(result, verifiedPetsActor())).toEqual([]);
  });
});
