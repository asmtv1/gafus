import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { reportClientError } from "@/shared/lib/tracer";
import {
  createReminderV49AG4Review,
  type V49AG4MockStore,
  type V49AG4Record,
} from "./reminderV49AG4Compat.review";
import type {
  ImmutableReminderV2Post,
  ImmutableReminderV2Get,
  Receipt,
} from "./reminderV2Candidate";
import type { ApiResponse } from "@/shared/lib/api/client";
import type { Reminder } from "@/shared/lib/api/reminders";
const KEY = "4bc11bb9-a9a7-499a-8aa2-86fbeabfa47d";
const HANDLE = "h_" + "a".repeat(32);
const actor = (ownerId = "A", authEpoch = "E1") => ({ ownerId, authEpoch });
const draft = () => ({
  name: "  Прогулка ",
  reminderTime: "09:00",
  reminderDays: "3,1",
  timezone: "Europe/Moscow",
});
const row = () => ({
  id: "R1",
  name: "Прогулка",
  reminderTime: "09:00",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
  enabled: true,
});
const unknown = (phase: V49AG4Record["phase"] = "MAY_HAVE_SENT"): V49AG4Record => ({
  schemaVersion: 2,
  ownerScopeHandle: HANDLE,
  authEpoch: "E1",
  idempotencyKey: KEY,
  phase,
  createdAt: 1000,
  lastSeenAt: 1000,
});
function memory() {
  let value: unknown = null;
  const store: V49AG4MockStore = {
    load: vi.fn(async () => (value === null ? null : JSON.parse(JSON.stringify(value)))),
    reserve: vi.fn(async (record) => {
      if (value !== null) return false;
      value = JSON.parse(JSON.stringify(record));
      return true;
    }),
    cas: vi.fn(async (previous, next) => {
      if (JSON.stringify(value) !== JSON.stringify(previous)) return false;
      value = JSON.parse(JSON.stringify(next));
      return true;
    }),
  };
  return {
    store,
    get: () => value,
    put: (next: unknown) => {
      value = next;
    },
  };
}
type PostFn = (request: ImmutableReminderV2Post) => Promise<ApiResponse<Reminder>>;
type GetFn = (request: ImmutableReminderV2Get) => Promise<ApiResponse<Receipt>>;
let db: ReturnType<typeof memory>,
  post: ReturnType<typeof vi.fn<PostFn>>,
  get: ReturnType<typeof vi.fn<GetFn>>;
function build() {
  return createReminderV49AG4Review({
    store: db.store,
    scopeHandle: (who) => (who.ownerId === "A" ? HANDLE : "h_" + "b".repeat(32)),
    clock: () => 1000,
    uuidV4: () => KEY,
    postMock: (request) => post(request),
    lookupMock: (request) => get(request),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  db = memory();
  post = vi.fn<PostFn>().mockResolvedValue({ success: true, data: row() });
  get = vi.fn<GetFn>().mockResolvedValue({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
});
describe("AG4 V49 pseudonymous CAS durable source-only adapter", () => {
  it("strict seven-field minimal record before POST, PREPARED and MAY_HAVE_SENT CAS proof", async () => {
    const gate = build();
    expect(await gate.restore(actor(), () => true)).toBe("idle");
    post.mockImplementationOnce(async (request: ImmutableReminderV2Post) => {
      expect(request.headers).toEqual({ "Idempotency-Key": KEY });
      expect(db.get()).toEqual(unknown());
      expect(JSON.stringify(db.get())).not.toMatch(
        /ownerId|Прогулка|reminderTime|timezone|JWT|clientRequestId/,
      );
      return { success: true, data: row() };
    });
    expect((await gate.create(actor(), draft(), () => true)).kind).toBe("acknowledged");
    expect(db.store.reserve).toHaveBeenCalledOnce();
    expect(db.store.cas).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
    expect((db.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
  });
  it("store CAS failure after PREPARED blocks dispatch and restart shows UNKNOWN", async () => {
    db.store.cas = vi.fn().mockResolvedValue(false);
    const gate = build();
    await gate.restore(actor(), () => true);
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect((db.get() as V49AG4Record).phase).toBe("PREPARED");
    expect(await build().restore(actor(), () => true)).toBe("unknown");
  });
  it("double concurrent instances with same empty snapshot use one atomic reserve and POST", async () => {
    const first = build(),
      second = build();
    expect(await first.restore(actor(), () => true)).toBe("idle");
    expect(await second.restore(actor(), () => true)).toBe("idle");
    const results = await Promise.all([
      first.create(actor(), draft(), () => true),
      second.create(actor(), draft(), () => true),
    ]);
    expect(results.map((x) => x.kind).sort()).toEqual(["acknowledged", "blocked"]);
    expect(post).toHaveBeenCalledOnce();
  });
  it("REJECTED CAP400 / CONFLICT409 / INVALID400 distinguish in result, storage safe generic REJECTED", async () => {
    for (const [code, kind] of [
      ["REMINDER_LIMIT_REACHED", "rejected"],
      ["REMINDER_IDEMPOTENCY_CONFLICT", "terminal"],
      ["REMINDER_IDEMPOTENCY_INVALID", "terminal"],
    ] as const) {
      db = memory();
      post.mockReset().mockResolvedValue({ success: false, code });
      const gate = build();
      await gate.restore(actor(), () => true);
      const response = await gate.create(actor(), draft(), () => true);
      expect(response.kind).toBe(kind);
      expect((db.get() as V49AG4Record).phase).toBe("REJECTED");
      expect(await build().restore(actor(), () => true)).toBe("terminal");
    }
  });
  it("expired/foreign/tombstoned 404 remains UNKNOWN; owner 200 persists server creation, NOT draft equality", async () => {
    db.put(unknown());
    const gate = build();
    expect(await gate.restore(actor(), () => true)).toBe("unknown");
    expect(await gate.manualLookup(actor(), () => true)).toEqual({ kind: "unknown" });
    expect(get).toHaveBeenCalledExactlyOnceWith({
      method: "GET",
      path: `/api/v1/reminders/operations/${KEY}`,
      requestGuard: expect.any(Function),
    });
    get.mockResolvedValueOnce({ success: true, data: { status: "COMMITTED", reminder: row() } });
    expect(await gate.manualLookup(actor(), () => true)).toEqual({
      kind: "server_committed_unverified_draft",
      reminder: row(),
    });
    expect((db.get() as V49AG4Record).phase).toBe("SERVER_COMMITTED_UNVERIFIED_DRAFT");
    expect((db.get() as V49AG4Record).schemaVersion).toBe(2);
    expect(await build().restore(actor(), () => true)).toBe("server_committed_unverified_draft");
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
  it("200 COMMITTED followed by failed durable CAS is NOT confirmed and never auto-sends", async () => {
    db.put(unknown());
    const gate = build();
    expect(await gate.restore(actor(), () => true)).toBe("unknown");
    get.mockResolvedValueOnce({ success: true, data: { status: "COMMITTED", reminder: row() } });
    db.store.cas = vi.fn().mockResolvedValue(false);
    expect(await gate.manualLookup(actor(), () => true)).toEqual({ kind: "blocked" });
    expect((db.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
    expect(gate.state()).toBe("blocked");
    expect(await build().restore(actor(), () => true)).toBe("unknown");
    expect(post).not.toHaveBeenCalled();
  });
  it("owner/session loses verification before manual GET or during pending 200 response", async () => {
    db.put(unknown());
    const gate = build();
    await gate.restore(actor(), () => true);
    let live = false;
    expect(await gate.manualLookup(actor(), () => live)).toEqual({ kind: "stale" });
    expect(get).not.toHaveBeenCalled();
    live = true;
    let resolve!: (v: {
      success: true;
      data: { status: "COMMITTED"; reminder: ReturnType<typeof row> };
    }) => void;
    get.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = gate.manualLookup(actor(), () => live);
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    live = false;
    resolve({ success: true, data: { status: "COMMITTED", reminder: row() } });
    expect(await pending).toEqual({ kind: "stale" });
    expect((db.get() as V49AG4Record).phase).toBe("MAY_HAVE_SENT");
  });
  it("unknown/old schema/extra payload/raw ownerId fail closed, no key allocation or POST", async () => {
    for (const corrupted of [
      { ...unknown(), schemaVersion: 1 },
      { ...unknown(), ownerId: "A" },
      { ...unknown(), name: "PII" },
      { ...unknown(), ownerScopeHandle: "A" },
    ]) {
      db = memory();
      db.put(corrupted);
      const gate = build();
      expect(await gate.restore(actor(), () => true)).toBe("blocked");
      expect(await gate.create(actor(), draft(), () => true)).not.toHaveProperty("reminder");
    }
    expect(post).not.toHaveBeenCalled();
  });
  it("owner/session A→B→A epoch quarantined; no lookup or POST and no identifier traces", async () => {
    db.put(unknown());
    const gate = build();
    expect(await gate.restore(actor("A", "E2"), () => true)).toBe("quarantined");
    expect(await gate.manualLookup(actor("A", "E2"), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toContain(KEY);
  });
  it("different owner with coincidentally same epoch is quarantined by derived handle", async () => {
    db.put(unknown());
    const gate = build();
    expect(await gate.restore(actor("B", "E1"), () => true)).toBe("quarantined");
    expect(await gate.create(actor("B", "E1"), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("invalid/load fault store quarantines UI without network and no private error trace", async () => {
    db.store.load = vi.fn().mockRejectedValue(new Error(`PRIVATE_${KEY}`));
    const gate = build();
    expect(await gate.restore(actor(), () => true)).toBe("blocked");
    expect(post).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toContain(KEY);
  });
});
