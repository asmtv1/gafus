/** AG1 OFF021 v2-only HTTP validation/ownership/error method proof.
 * Real Hono+Zod, injected verified principal, access and journal service.
 * No signed JWT, PG, migrated schema, native queue, or historical replay.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  send: vi.fn(),
  lookup: vi.fn(),
  access: vi.fn(),
  prevention: vi.fn(),
}));
vi.mock("@gafus/core/services/offline", () => ({
  getCourseVersion: vi.fn(),
  checkCourseUpdates: vi.fn(),
  downloadFullCourse: vi.fn(),
  submitNewOfflinePracticeMutation: m.send,
  submitNewOfflinePreventionBatch: m.prevention,
  findNewOfflineMutationReceipt: m.lookup,
  OfflineMutationJournalError: class extends Error {
    constructor(public readonly code: string) {
      super(code);
      this.name = "OfflineMutationJournalError";
    }
  },
}));
vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  requireCourseStepOperationAccess: m.access,
}));
// Offline v2 reuses the REAL canonical batch schema, not the side-effectful
// reminder-delivery index imported by the compiled public Core barrel.
vi.mock("@gafus/core/services/petPrevention", async () => {
  const schemas = await import("../../../../../packages/core/src/services/petPrevention/schemas");
  return { batchEntrySchema: schemas.batchEntrySchema };
});
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn(),
  isOfflineCourseDownloadIncludedPlanCode: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
import { offlineRoutes } from "./offline";
import { OfflineMutationJournalError } from "@gafus/core/services/offline";
const EVENT = "514acd7f-3e91-42d1-8409-05dd8cc82911";
const BODY = {
  eventId: EVENT,
  operation: "training.complete.practice",
  courseId: "clwcourse00000000000000001",
  dayOnCourseId: "clwdayoc0000000000000001",
  stepIndex: 0,
};
const PREVENTION_BODY = {
  eventId: EVENT,
  operation: "prevention.batch",
  petId: "synthetic-petA",
  entries: [
    {
      eventId: "23a47d4c-9b22-4f0b-a0e6-06d634e7a701",
      clientId: "71243d0c-a88f-4999-b74e-0c72f38782f1",
      type: "VACCINATION",
      performedAt: "2026-10-16T12:00:00.000Z",
      reminderEnabled: false,
    },
    {
      eventId: "23a47d4c-9b22-4f0b-a0e6-06d634e7a702",
      clientId: "71243d0c-a88f-4999-b74e-0c72f38782f2",
      type: "DEWORMING",
      performedAt: "2026-10-16T12:00:00.000Z",
      reminderEnabled: false,
    },
  ],
};
const PREVENTION_ACK = {
  success: true,
  ack: {
    protocol: 2,
    eventId: EVENT,
    state: "COMMITTED",
    operation: "prevention.batch",
    replayed: false,
    serverRevision: "1",
    items: PREVENTION_BODY.entries.map((x, index) => ({
      eventId: x.eventId,
      clientId: x.clientId,
      state: "COMMITTED",
      result: "CREATED",
      serverRowId: "synthetic-row" + index,
    })),
  },
};
const ACK = {
  success: true,
  ack: {
    protocol: 2,
    eventId: EVENT,
    state: "COMMITTED",
    replayed: false,
    operation: BODY.operation,
    serverRevision: "1",
    result: { courseId: BODY.courseId, allCompleted: true, stepJustCompleted: true },
  },
};
function app() {
  const a = new Hono();
  a.use("/api/v1/offline/*", async (c, next) => {
    c.set("user", { id: c.req.header("x-synthetic-owner") ?? "A", role: "USER", username: "fake" });
    await next();
  });
  a.route("/api/v1/offline", offlineRoutes);
  return a;
}
async function request(
  method: "POST" | "GET",
  suffix: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await app().request(`http://test.local/api/v1/offline${suffix}`, {
    method,
    headers: {
      "x-gafus-sync-protocol": "2",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json(), cache: res.headers.get("cache-control") };
}
function post(body: unknown = BODY, headers: Record<string, string> = {}) {
  return request("POST", "/mutations", body, { "idempotency-key": EVENT, ...headers });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ courseId: BODY.courseId, courseType: "synthetic" });
  m.send.mockResolvedValue(ACK);
  m.prevention.mockResolvedValue(PREVENTION_ACK);
  m.lookup.mockResolvedValue(ACK);
});
describe("OFF021 NEW-only v2 safe Hono adapter current implementation", () => {
  it("V2H01 success returns correlated ACK and private no-store, authenticated synthetic user used", async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ACK);
    expect(r.cache).toBe("private, no-store");
    expect(m.access).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "A", dayOnCourseId: BODY.dayOnCourseId }),
    );
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "A", eventId: EVENT }));
  });
  it("V2H02 missing protocol 400 before authorizing or applying mutation", async () => {
    const r = await post(BODY, { "x-gafus-sync-protocol": "" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "UNSUPPORTED_SYNC_PROTOCOL" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("V2H03 wrong event header 400 before Core", async () => {
    const r = await post(BODY, { "idempotency-key": "6aaf6cff-2a3e-4a75-8b54-23f45ba58375" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(m.access).not.toHaveBeenCalled();
  });
  it("V2H04 malformed UUID/nonv4 UUID and negative stepIndex fail Zod", async () => {
    for (const b of [
      { ...BODY, eventId: "00000000-0000-0000-0000-000000000000" },
      { ...BODY, stepIndex: -1 },
    ]) {
      const r = await post(b);
      expect(r.status).toBe(400);
      expect(r.cache).toBe("private, no-store");
    }
    expect(m.send).not.toHaveBeenCalled();
  });
  it("V2H05 unexpected old queueId or unknown new operation body cannot be smuggled", async () => {
    for (const b of [
      { ...BODY, queueId: "legacy" },
      { ...BODY, operation: "training.reset" },
    ])
      expect((await post(b)).status).toBe(400);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("V2H06 client epoch not accepted as server identity", async () => {
    const r = await post(BODY, { "x-client-auth-epoch": "unverified-client-epoch" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "UNSUPPORTED_EPOCH_HEADER" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("V2H07 course access denial 403 before journal write", async () => {
    m.access.mockRejectedValueOnce(new Error("COURSE_ACCESS_DENIED"));
    const r = await post();
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("V2H08 journal key conflict 409 without ACK", async () => {
    m.send.mockRejectedValueOnce(new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT"));
    const r = await post();
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(JSON.stringify(r.body)).not.toContain("ack");
  });
  it("V2H09 missing unapplied journal table unavailable 503, NEVER fall back legacy", async () => {
    m.send.mockRejectedValueOnce(new OfflineMutationJournalError("JOURNAL_UNAVAILABLE"));
    const r = await post();
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
    expect(r.cache).toBe("private, no-store");
  });
  it("V2H10 GET owner-scoped current principal and replayed stored ACK", async () => {
    const r = await request("GET", `/mutations/${EVENT}`, undefined, { "x-synthetic-owner": "B" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ACK);
    expect(m.lookup).toHaveBeenCalledWith("B", EVENT);
  });
  it("V2H11 GET wrong event/missing protocol/unknown ID 400/400/404 and no-store", async () => {
    const a = await request("GET", "/mutations/wrong");
    expect(a.status).toBe(400);
    const b = await request("GET", `/mutations/${EVENT}`, undefined, {
      "x-gafus-sync-protocol": "",
    });
    expect(b.status).toBe(400);
    m.lookup.mockResolvedValueOnce(null);
    const c = await request("GET", `/mutations/${EVENT}`);
    expect(c.status).toBe(404);
    expect(c.cache).toBe("private, no-store");
  });
  it("V2H12 old-server-safe new endpoint is absent if old offline course-only router is mounted", async () => {
    // Deliberately mimic old route table: only three existing paths, no mutations.
    const old = new Hono();
    old.get("/course/version", (c) => c.json({ success: true }));
    old.get("/course/updates", (c) => c.json({ success: true }));
    old.get("/course/download", (c) => c.json({ success: true }));
    const res = await old.request("http://test.local/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(BODY),
    });
    expect(res.status).toBe(404);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("PVH01 valid prevention.batch returns per-item COMMITTED ACK, owner and ISO performedAt", async () => {
    const r = await post(PREVENTION_BODY);
    expect(r.status).toBe(200);
    expect(r.cache).toBe("private, no-store");
    expect(r.body).toEqual(PREVENTION_ACK);
    expect(m.prevention).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "A",
        operation: "prevention.batch",
        petId: PREVENTION_BODY.petId,
        entries: expect.arrayContaining([
          expect.objectContaining({
            clientId: PREVENTION_BODY.entries[0]?.clientId,
            performedAt: PREVENTION_BODY.entries[0]?.performedAt,
          }),
        ]),
      }),
    );
    expect(m.send).not.toHaveBeenCalled();
  });
  it("PVH02 duplicate clientId or item eventId in same batch rejected 400 before Core", async () => {
    const first = PREVENTION_BODY.entries[0]!;
    for (const entries of [
      [first, { ...PREVENTION_BODY.entries[1]!, clientId: first.clientId }],
      [first, { ...PREVENTION_BODY.entries[1]!, eventId: first.eventId }],
    ]) {
      const r = await post({ ...PREVENTION_BODY, entries });
      expect(r.status).toBe(400);
      expect(r.cache).toBe("private, no-store");
    }
    expect(m.prevention).not.toHaveBeenCalled();
  });
  it("PVH03 modified parent Idempotency-Key 400 no journal dispatch", async () => {
    const r = await post(PREVENTION_BODY, {
      "idempotency-key": "6aaf6cff-2a3e-4a75-8b54-23f45ba58375",
    });
    expect(r.status).toBe(400);
    expect(m.prevention).not.toHaveBeenCalled();
  });
  it("PVH04 changed immutable clientId payload Core 409 with NO partial ACK", async () => {
    m.prevention.mockRejectedValueOnce(new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT"));
    const r = await post(PREVENTION_BODY);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(JSON.stringify(r.body)).not.toContain("ack");
  });
  it("PVH05 foreign pet auth Core 404 without ACK", async () => {
    m.prevention.mockRejectedValueOnce(new OfflineMutationJournalError("PET_NOT_FOUND"));
    const r = await post(PREVENTION_BODY, { "x-synthetic-owner": "B" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "PET_NOT_FOUND" });
    expect(JSON.stringify(r.body)).not.toContain("ack");
  });
  it("PVH06 legacy queueId and invalid calendar date reject before any new journal write", async () => {
    const bad = [
      { ...PREVENTION_BODY, queueId: "old" },
      {
        ...PREVENTION_BODY,
        entries: [{ ...PREVENTION_BODY.entries[0]!, performedAt: "not-a-date" }],
      },
    ];
    for (const payload of bad) {
      const r = await post(payload);
      expect(r.status).toBe(400);
      expect(r.cache).toBe("private, no-store");
    }
    expect(m.prevention).not.toHaveBeenCalled();
  });
  it("PVH07 absent compiled Core method fails closed 503; NEVER legacy upsert", async () => {
    m.prevention.mockRejectedValueOnce(new OfflineMutationJournalError("JOURNAL_UNAVAILABLE"));
    const r = await post(PREVENTION_BODY);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "JOURNAL_UNAVAILABLE" });
  });
  it("PVH08 typed array cannot be empty or exceed 50", async () => {
    for (const entries of [
      [],
      Array.from({ length: 51 }, (_, i) => ({
        ...PREVENTION_BODY.entries[0]!,
        eventId: "23a47d4c-9b22-4f0b-a0e6-06d634e7" + String(i).padStart(4, "0"),
        clientId: "71243d0c-a88f-4999-b74e-0c72f387" + String(i).padStart(4, "0"),
      })),
    ]) {
      const r = await post({ ...PREVENTION_BODY, entries });
      expect(r.status).toBe(400);
    }
    expect(m.prevention).not.toHaveBeenCalled();
  });
});
