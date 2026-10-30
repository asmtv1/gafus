import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  auth: true,
  loading: false,
  create: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.auth,
      isLoading: m.loading,
      user: m.auth ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/api/pet-vet-visits", () => ({
  petVetVisitsApi: { createResponse: m.create, detailResponse: m.detail },
}));
import { createVetVisitAndReadback, vetCreatePayload } from "./vetVisitCreate";
import { verifiedVetActor } from "./vetVisitsRead";
const input = () => ({
  visitedOn: "2026-10-18",
  specialty: " Терапевт ",
  doctorName: "",
  clinic: " ",
  diagnosis: "  Забота  ",
  conclusion: "",
  notes: "",
});
const saved = () => ({
  id: "visit1",
  petId: "pet1",
  visitedOn: "2026-10-18",
  specialty: "Терапевт",
  doctorName: "",
  clinic: "",
  diagnosis: "Забота",
  conclusion: "",
  notes: "",
  attachments: [],
  secretToken: "PRIVATE_DO_NOT_LOG",
});
const opts = () => ({
  actor: verifiedVetActor()!,
  petId: "pet1",
  day: "18.10.2026",
  draft: input(),
  live: () => true,
  now: new Date("2026-10-18T12:00:00Z"),
});
const deferred = <T>() => {
  let resolve!: (x: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.auth = true;
  m.loading = false;
  m.create.mockResolvedValue({ success: true, data: saved() });
  m.detail.mockResolvedValue({ success: true, data: saved() });
});
describe("AG3 V44 existing Core POST → authoritative GET contract, create only", () => {
  it("sends exactly required fields and changed nonempty optional inputs, never arbitrary owner/keys", async () => {
    const normalized = vetCreatePayload("18.10.2026", input(), new Date("2026-10-18T12:00:00Z"));
    expect(normalized).toEqual({
      ok: true,
      value: { visitedOn: "2026-10-18", specialty: "Терапевт", diagnosis: "Забота" },
      expected: {
        visitedOn: "2026-10-18",
        specialty: "Терапевт",
        doctorName: "",
        clinic: "",
        diagnosis: "Забота",
        conclusion: "",
        notes: "",
      },
    });
  });
  it("one POST, one exact owner-guarded GET, identity + full normalized field readback", async () => {
    const result = await createVetVisitAndReadback(opts());
    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") throw Error("bad result");
    expect(JSON.stringify(result.visit)).not.toContain("PRIVATE_DO_NOT_LOG");
    expect(m.create).toHaveBeenCalledExactlyOnceWith(
      "pet1",
      { visitedOn: "2026-10-18", specialty: "Терапевт", diagnosis: "Забота" },
      expect.any(Function),
    );
    expect(m.detail).toHaveBeenCalledExactlyOnceWith("pet1", "visit1", expect.any(Function));
    expect(m.create.mock.calls[0][2]()).toBe(true);
    expect(m.detail.mock.calls[0][2]()).toBe(true);
  });
  it.each(["30.02.2026", "01.01.1899", "22.12.2026", "not-a-date"])(
    "invalid date %s never sends POST",
    async (day) => {
      expect(await createVetVisitAndReadback({ ...opts(), day })).toEqual({
        kind: "invalid",
        field: "date",
      });
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it("no specialty and overlong clinical text are rejected locally", async () => {
    expect(
      await createVetVisitAndReadback({ ...opts(), draft: { ...input(), specialty: " " } }),
    ).toEqual({ kind: "invalid", field: "specialty" });
    expect(
      await createVetVisitAndReadback({
        ...opts(),
        draft: { ...input(), doctorName: "x".repeat(201) },
      }),
    ).toEqual({ kind: "invalid", field: "fields" });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("confirmed precommit VET validation can be corrected without an automatic POST", async () => {
    m.create.mockResolvedValueOnce({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { specialty: "REQUIRED" } },
    });
    expect(await createVetVisitAndReadback(opts())).toEqual({
      kind: "rejected",
      fieldErrors: { specialty: "REQUIRED" },
    });
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("invalid JSON structured 400 rejected; malformed code remains unknown", async () => {
    m.create.mockResolvedValueOnce({
      success: false,
      code: "VET_VISIT_INVALID_JSON",
      details: { fieldErrors: { body: "INVALID_JSON" } },
    });
    expect(await createVetVisitAndReadback(opts())).toEqual({
      kind: "rejected",
      fieldErrors: { body: "INVALID_JSON" },
    });
    m.create.mockResolvedValueOnce({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { notes: "UNSUPPORTED" } },
    });
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
  });
  it("lost/timeout POST ACK becomes UNKNOWN with exactly one write and no fabricated GET", async () => {
    m.create.mockRejectedValueOnce(new Error("token=PRIVATE&medical=private"));
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("POST 400/500/invalid body fail closed UNKNOWN; client cannot prove no insert", async () => {
    for (const code of ["BAD_REQUEST", "REQUEST_TIMEOUT", "SERVER_ERROR", "INVALID_RESPONSE"]) {
      m.create.mockResolvedValueOnce({ success: false, code, error: "private-medical-error" });
      expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    }
    expect(m.create).toHaveBeenCalledTimes(4);
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("wrong ACK identity or changed fields is UNKNOWN and never triggers GET", async () => {
    m.create.mockResolvedValueOnce({ success: true, data: { ...saved(), petId: "other" } });
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    m.create.mockResolvedValueOnce({ success: true, data: { ...saved(), diagnosis: "WRONG" } });
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("ACK positive but GET not found, timeout, or inconsistent fields remains UNKNOWN", async () => {
    m.detail.mockResolvedValueOnce({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    m.detail.mockRejectedValueOnce(new Error("network lost"));
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    m.detail.mockResolvedValueOnce({ success: true, data: { ...saved(), clinic: "OTHER" } });
    expect(await createVetVisitAndReadback(opts())).toEqual({ kind: "unknown" });
    expect(m.create).toHaveBeenCalledTimes(3);
    expect(m.detail).toHaveBeenCalledTimes(3);
  });
  it("A→B→A owner/epoch re-login while POST pending drops stale ACK; no GET", async () => {
    const d = deferred<{ success: boolean; data: ReturnType<typeof saved> }>();
    m.create.mockReturnValueOnce(d.promise);
    const request = createVetVisitAndReadback(opts());
    m.owner = "B";
    m.epoch = "B1";
    m.owner = "A";
    m.epoch = "E2";
    expect(m.create.mock.calls[0][2]()).toBe(false);
    d.resolve({ success: true, data: saved() });
    expect(await request).toEqual({ kind: "stale" });
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("logout/unmount while readback delayed drops late medical success", async () => {
    const d = deferred<{ success: boolean; data: ReturnType<typeof saved> }>();
    m.detail.mockReturnValueOnce(d.promise);
    let mounted = true;
    const request = createVetVisitAndReadback({ ...opts(), live: () => mounted });
    await vi.waitFor(() => expect(m.detail).toHaveBeenCalledOnce());
    mounted = false;
    m.auth = false;
    d.resolve({ success: true, data: saved() });
    expect(await request).toEqual({ kind: "stale" });
  });
});
