import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  logged: true,
  detail: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.logged,
      isLoading: false,
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
  petVetVisitsApi: { detailResponse: m.detail, deleteResponse: m.del },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { deleteVetVisitAndReadback } from "./vetVisitDelete";
import { verifiedVetActor } from "./vetVisitsRead";
const own = () => ({
  id: "visit1",
  petId: "pet1",
  visitedOn: "2026-10-18",
  specialty: "Vet",
  doctorName: "Doc",
  clinic: "Clinic",
  diagnosis: "SyntheticDiagnosis",
  conclusion: "SyntheticResult",
  notes: "SyntheticNote",
  attachments: [],
});
const inputs = () => ({
  actor: verifiedVetActor()!,
  petId: "pet1",
  original: own(),
  live: () => true,
});
const deferred = <T>() => {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((fn) => (resolve = fn));
  return { resolve, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.logged = true;
  m.detail
    .mockReset()
    .mockResolvedValueOnce({ success: true, data: own() })
    .mockResolvedValueOnce({ success: false, code: "VET_VISIT_NOT_FOUND" });
  m.del.mockReset().mockResolvedValue({ success: true });
});
describe("V46 owner-scoped confirmed DELETE→authoritative detail 404", () => {
  it("one DELETE only after fresh owner GET; exact owner 404 readback confirms", async () => {
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "confirmed" });
    expect(m.del).toHaveBeenCalledExactlyOnceWith("pet1", "visit1", expect.any(Function));
    expect(m.detail).toHaveBeenCalledTimes(2);
    expect(m.del.mock.calls[0][2]()).toBe(true);
  });
  it("existing attachments block before GET/DELETE, no storage dispatch", async () => {
    expect(
      await deleteVetVisitAndReadback({
        ...inputs(),
        original: {
          ...own(),
          attachments: [
            {
              id: "att1",
              name: "document.pdf",
              mimeType: "application/pdf",
              sizeBytes: 100,
              hasPreview: false,
            },
          ],
        },
      }),
    ).toEqual({ kind: "blocked_attachments" });
    expect(m.detail).not.toHaveBeenCalled();
    expect(m.del).not.toHaveBeenCalled();
  });
  it("preflight exposes newly attached files or changed clinical details => zero DELETE", async () => {
    m.detail.mockReset().mockResolvedValueOnce({
      success: true,
      data: {
        ...own(),
        attachments: [
          {
            id: "att1",
            name: "document.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
            hasPreview: false,
          },
        ],
      },
    });
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "blocked_attachments" });
    m.detail
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: { ...own(), diagnosis: "Changed" } });
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "unknown" });
    expect(m.del).not.toHaveBeenCalled();
  });
  it("foreign or missing preflight 404 does not issue DELETE", async () => {
    m.detail.mockReset().mockResolvedValue({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "missing" });
    expect(m.del).not.toHaveBeenCalled();
  });
  it("DELETE 404 not proof client deleted; never attempt subsequent GET", async () => {
    m.del.mockResolvedValue({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "missing" });
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("lost ACK or 503 is UNKNOWN; never DELETE again or infer absence from list", async () => {
    m.del.mockRejectedValueOnce(new Error("synthetic clinical error"));
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "unknown" });
    expect(m.del).toHaveBeenCalledOnce();
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("success ACK with non-404 or malformed readback stays UNKNOWN", async () => {
    m.detail
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: own() })
      .mockResolvedValueOnce({ success: true, data: own() });
    expect(await deleteVetVisitAndReadback(inputs())).toEqual({ kind: "unknown" });
    expect(m.del).toHaveBeenCalledOnce();
    expect(m.detail).toHaveBeenCalledTimes(2);
  });
  it("A→B→A while DELETE pending ignores late ACK and never does second GET", async () => {
    const wait = deferred<{ success: boolean }>();
    m.del.mockReturnValueOnce(wait.promise);
    const pending = deleteVetVisitAndReadback(inputs());
    await vi.waitFor(() => expect(m.del).toHaveBeenCalledOnce());
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(m.del.mock.calls[0][2]()).toBe(false);
    wait.resolve({ success: true });
    expect(await pending).toEqual({ kind: "stale" });
    expect(m.detail).toHaveBeenCalledOnce();
  });
  it("unmount while GET readback pending drops stale result", async () => {
    const wait = deferred<{ success: boolean; code: string }>();
    m.detail
      .mockReset()
      .mockResolvedValueOnce({ success: true, data: own() })
      .mockReturnValueOnce(wait.promise);
    let mounted = true;
    const pending = deleteVetVisitAndReadback({ ...inputs(), live: () => mounted });
    await vi.waitFor(() => expect(m.detail).toHaveBeenCalledTimes(2));
    mounted = false;
    wait.resolve({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await pending).toEqual({ kind: "stale" });
    expect(m.del).toHaveBeenCalledOnce();
  });
});
