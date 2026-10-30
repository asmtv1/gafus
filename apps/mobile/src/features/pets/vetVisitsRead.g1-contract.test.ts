import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  logged: true,
  loading: false,
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.logged,
      isLoading: m.loading,
      user: m.logged ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/pet-vet-visits", () => ({
  petVetVisitsApi: { listResponse: m.list, detailResponse: m.detail },
}));
import {
  verifiedVetActor,
  sameVetActor,
  vetVisitsForActor,
  vetVisitDetailForActor,
  publicOwnVetVisit,
  signedVetMediaUrl,
} from "./vetVisitsRead";
const row = () => ({
  id: "visit1",
  petId: "pet1",
  visitedOn: "2026-10-18",
  specialty: "Терапевт",
  doctorName: "DOC_PRIVATE",
  clinic: "CLINIC_PRIVATE",
  diagnosis: "DIAGNOSIS_PRIVATE",
  conclusion: "RESULT_PRIVATE",
  notes: "NOTES_PRIVATE",
  attachments: [
    {
      id: "att1",
      name: "scan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 87,
      hasPreview: false,
      originalKey: "SECRET_STORAGE_KEY",
      signedUrl: "https://private.example/x",
      ownerToken: "TOKEN",
    },
  ],
  unrecognizedPatient: "HIDDEN_RAW",
  medicalStorageKey: "SECRET",
});
const wait = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { resolve, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.logged = true;
  m.loading = false;
});
describe("AG3 V43 Hono/Core vet list+detail owner metadata only", () => {
  it("owned GET list 200 [] means genuine empty list only", async () => {
    m.list.mockResolvedValue({ success: true, data: [] });
    const actor = verifiedVetActor();
    expect(await vetVisitsForActor(actor, "pet1").queryFn()).toEqual({
      kind: "ready",
      data: [],
      scope: { ownerId: "A", authEpoch: "E1", petId: "pet1" },
    });
    expect(m.list).toHaveBeenCalledWith("pet1", expect.any(Function));
    expect(m.list.mock.calls[0][1]()).toBe(true);
  });
  it("404 foreign/unknown owner does NOT become empty; 400/503/timeout remain unknown", async () => {
    const actor = verifiedVetActor();
    m.list.mockResolvedValueOnce({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await vetVisitsForActor(actor, "pet1").queryFn()).toEqual({ kind: "missing" });
    for (const code of ["BAD_REQUEST", "INVALID_RESPONSE", "REQUEST_TIMEOUT", "NETWORK_ERROR"]) {
      m.list.mockResolvedValueOnce({ success: false, code, error: "PRIVATE_RECORD_ERROR" });
      expect(await vetVisitsForActor(actor, "pet1").queryFn()).toEqual({ kind: "unknown" });
    }
  });
  it("list/detail strip unsigned links, object keys and arbitrary data from exact DTO", async () => {
    const actor = verifiedVetActor();
    m.list.mockResolvedValue({ success: true, data: [row()] });
    const list = await vetVisitsForActor(actor, "pet1").queryFn();
    expect(list.kind).toBe("ready");
    expect(JSON.stringify(list)).not.toContain("SECRET_STORAGE_KEY");
    expect(JSON.stringify(list)).not.toContain("signedUrl");
    expect(JSON.stringify(list)).not.toContain("HIDDEN_RAW");
    m.detail.mockResolvedValue({ success: true, data: row() });
    const detail = await vetVisitDetailForActor(actor, "pet1", "visit1").queryFn();
    expect(detail.kind).toBe("ready");
    expect(JSON.stringify(detail)).not.toContain("TOKEN");
    expect(m.detail).toHaveBeenCalledWith("pet1", "visit1", expect.any(Function));
  });
  it("mismatched petId, wrong visitId, invalid attachments and invalid date fail closed", async () => {
    const actor = verifiedVetActor();
    for (const bad of [
      { ...row(), petId: "foreign" },
      { ...row(), attachments: [{ signedUrl: "https://private" }] },
      { ...row(), visitedOn: "bad" },
    ]) {
      m.list.mockResolvedValueOnce({ success: true, data: [bad] });
      expect(await vetVisitsForActor(actor, "pet1").queryFn()).toEqual({ kind: "unknown" });
    }
    m.detail.mockResolvedValue({ success: true, data: { ...row(), id: "different" } });
    expect(await vetVisitDetailForActor(actor, "pet1", "visit1").queryFn()).toEqual({
      kind: "unknown",
    });
  });
  it("owner A→B→A new authEpoch during delayed list or detail suppresses old health data", async () => {
    const actor = verifiedVetActor();
    const deferred = wait<{ success: boolean; data: unknown }>();
    m.list.mockReturnValueOnce(deferred.promise);
    const old = vetVisitsForActor(actor, "pet1");
    const req = old.queryFn();
    m.owner = "B";
    m.epoch = "B-E";
    m.owner = "A";
    m.epoch = "E2";
    expect(sameVetActor(actor)).toBe(false);
    expect(m.list.mock.calls[0][1]()).toBe(false);
    deferred.resolve({ success: true, data: [row()] });
    expect(await req).toEqual({ kind: "stale" });
    expect(vetVisitsForActor(verifiedVetActor(), "pet1").queryKey).toEqual([
      "pet-vet-visits",
      "owner",
      "A",
      "E2",
      "pet1",
    ]);
  });
  it("logout while detail pending rejects callback, no read for unverified owner", async () => {
    const actor = verifiedVetActor();
    const deferred = wait<{ success: boolean; data: unknown }>();
    m.detail.mockReturnValueOnce(deferred.promise);
    const req = vetVisitDetailForActor(actor, "pet1", "visit1").queryFn();
    m.logged = false;
    deferred.resolve({ success: true, data: row() });
    expect(await req).toEqual({ kind: "stale" });
    expect(await vetVisitsForActor(actor, "pet1").queryFn()).toEqual({ kind: "stale" });
    expect(m.list).not.toHaveBeenCalled();
  });
  it("projection rejects foreign/unknown route ids without HTTP", async () => {
    const actor = verifiedVetActor();
    expect(publicOwnVetVisit({ ...row(), petId: "other" }, "pet1")).toBeNull();
    expect(await vetVisitsForActor(actor, "!unsafe").queryFn()).toEqual({ kind: "missing" });
    expect(await vetVisitDetailForActor(actor, "pet1", "/etc").queryFn()).toEqual({
      kind: "missing",
    });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("never open unsigned HTTP, bare HTTPS, invalid/expired CDN/S3 medical URLs", () => {
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    expect(signedVetMediaUrl("http://files.example/a", now)).toBeNull();
    expect(signedVetMediaUrl("https://files.example/private.pdf", now)).toBeNull();
    expect(
      signedVetMediaUrl("https://files.example/md5(token,1600000000)/users/x", now),
    ).toBeNull();
    const goodCdn = "https://files.example/md5(abCd_123,2000000000)/users/private/photo.webp";
    expect(signedVetMediaUrl(goodCdn, now)).toBe(goodCdn);
    const signed =
      "https://storage.example/files?X-Amz-Signature=abc&X-Amz-Credential=secret&X-Amz-Date=20261018T120000Z&X-Amz-Expires=300";
    expect(signedVetMediaUrl(signed, now)).toBe(signed);
    expect(signedVetMediaUrl(signed, now + 301000)).toBeNull();
  });
});
