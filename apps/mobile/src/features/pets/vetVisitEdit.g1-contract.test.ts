import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ owner: "A", epoch: "E1", auth: true, read: vi.fn(), put: vi.fn() }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.auth,
      isLoading: false,
      user: m.auth ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/api/pet-vet-visits", () => ({
  petVetVisitsApi: { detailResponse: m.read, editResponse: m.put },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { editVetVisitAndReadback } from "./vetVisitEdit";
import { verifiedVetActor } from "./vetVisitsRead";
const original = () => ({
  id: "visit1",
  petId: "pet1",
  visitedOn: "2026-10-18",
  specialty: "Врач",
  doctorName: "Имя",
  clinic: "Клиника",
  diagnosis: "Старое",
  conclusion: "Рекомендация",
  notes: "Заметки",
  attachments: [
    { id: "att1", name: "dummy.pdf", mimeType: "application/pdf", sizeBytes: 5, hasPreview: false },
  ],
});
const draft = () => ({
  visitedOn: "2026-10-18",
  specialty: "Врач",
  doctorName: "Имя",
  clinic: "Клиника",
  diagnosis: "Новое",
  conclusion: "Рекомендация",
  notes: "Заметки",
});
const opts = () => ({
  actor: verifiedVetActor()!,
  petId: "pet1",
  original: original(),
  day: "18.10.2026",
  draft: draft(),
  live: () => true,
  now: new Date("2026-10-18T13:00:00Z"),
});
const waiting = <T>() => {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { resolve, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockReset();
  m.put.mockReset();
  m.owner = "A";
  m.epoch = "E1";
  m.auth = true;
  m.read
    .mockResolvedValueOnce({ success: true, data: original() })
    .mockResolvedValueOnce({ success: true, data: { ...original(), diagnosis: "Новое" } });
  m.put.mockResolvedValue({ success: true, data: { ...original(), diagnosis: "Новое" } });
});
describe("V45 owner-scoped full PUT preserving medical fields", () => {
  it("one changed diagnosis sends complete Core PUT; two authoritative GETs", async () => {
    const result = await editVetVisitAndReadback(opts());
    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") return;
    expect(result.changedFields).toEqual(["diagnosis"]);
    expect(m.put).toHaveBeenCalledExactlyOnceWith("pet1", "visit1", draft(), expect.any(Function));
    expect(m.read).toHaveBeenCalledTimes(2);
  });
  it("unchanged form skips any network write", async () => {
    expect(
      await editVetVisitAndReadback({ ...opts(), draft: { ...draft(), diagnosis: "Старое" } }),
    ).toEqual({ kind: "unchanged" });
    expect(m.read).not.toHaveBeenCalled();
    expect(m.put).not.toHaveBeenCalled();
  });
  it("stale base clinical fields or changed attachments prevent PUT", async () => {
    m.read
      .mockReset()
      .mockResolvedValue({ success: true, data: { ...original(), notes: "Изменено" } });
    expect(await editVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.put).not.toHaveBeenCalled();
    m.read
      .mockReset()
      .mockResolvedValue({ success: true, data: { ...original(), attachments: [] } });
    expect(await editVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.put).not.toHaveBeenCalled();
  });
  it("stable owner-404 before mutation returns missing and no PUT", async () => {
    m.read.mockReset().mockResolvedValue({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await editVetVisitAndReadback(opts())).toEqual({ kind: "missing" });
    expect(m.put).not.toHaveBeenCalled();
  });
  it("structured precommit 400 is rejected with fields and one PUT", async () => {
    m.put.mockResolvedValue({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { diagnosis: "OUT_OF_RANGE" } },
    });
    expect(await editVetVisitAndReadback(opts())).toEqual({
      kind: "rejected",
      fieldErrors: { diagnosis: "OUT_OF_RANGE" },
    });
    expect(m.put).toHaveBeenCalledOnce();
    expect(m.read).toHaveBeenCalledOnce();
  });
  it("ambiguous 400/503/mismatch stays UNKNOWN with no replay", async () => {
    m.put.mockResolvedValue({ success: false, code: "BAD_REQUEST" });
    expect(await editVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.put).toHaveBeenCalledOnce();
    m.read
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: original() })
      .mockResolvedValueOnce({ success: false, code: "REQUEST_TIMEOUT" });
    m.put.mockResolvedValue({ success: true, data: { ...original(), diagnosis: "Новое" } });
    expect(await editVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.put).toHaveBeenCalledTimes(2);
  });
  it("A-B-A epoch switch while PUT pending does not read back stale result", async () => {
    const d = waiting<{ success: boolean; data: ReturnType<typeof original> }>();
    m.put.mockReturnValueOnce(d.promise);
    const req = editVetVisitAndReadback(opts());
    await vi.waitFor(() => expect(m.put).toHaveBeenCalledOnce());
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(m.put.mock.calls[0][3]()).toBe(false);
    d.resolve({ success: true, data: { ...original(), diagnosis: "Новое" } });
    expect(await req).toEqual({ kind: "stale" });
    expect(m.read).toHaveBeenCalledOnce();
  });
});
