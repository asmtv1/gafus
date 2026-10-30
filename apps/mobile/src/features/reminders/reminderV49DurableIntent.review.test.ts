import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { reportClientError } from "@/shared/lib/tracer";
import {
  createReminderV49DurableReview,
  type ReminderV49Record,
  type ReminderV49MockStore,
} from "./reminderV49DurableIntent.review";
import type { ReminderV49MockDependencies } from "./reminderV49DurableIntent.review";
import type { ImmutableReminderV2Post, ImmutableReminderV2Get } from "./reminderV2Candidate";
const KEY = "4bc11bb9-a9a7-499a-8aa2-86fbeabfa47d";
const actor = (authEpoch = "E1", ownerId = "A") => ({ ownerId, authEpoch });
const draft = () => ({
  name: " Прогулка ",
  reminderTime: "09:00",
  reminderDays: "3,1",
  timezone: "Europe/Moscow",
});
const saved = () => ({
  id: "R1",
  name: "Прогулка",
  reminderTime: "09:00",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
  enabled: true,
});
const wait = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function mockStore() {
  let bytes: unknown = null;
  const store: ReminderV49MockStore = {
    load: vi.fn(async () => (bytes == null ? null : JSON.parse(JSON.stringify(bytes)))),
    reserve: vi.fn(async (record) => {
      if (bytes !== null) return false;
      bytes = JSON.parse(JSON.stringify(record));
      return true;
    }),
    transition: vi.fn(async (expected, next) => {
      if (JSON.stringify(bytes) !== JSON.stringify(expected)) return false;
      bytes = JSON.parse(JSON.stringify(next));
      return true;
    }),
  };
  return {
    store,
    get: () => bytes,
    put: (value: unknown) => {
      bytes = value;
    },
  };
}
let memory: ReturnType<typeof mockStore>;
let post: ReturnType<
  typeof vi.fn<
    (
      request: ImmutableReminderV2Post,
    ) => Promise<{ success: boolean; data?: ReturnType<typeof saved>; code?: string }>
  >
>;
let lookup: ReturnType<
  typeof vi.fn<
    (request: ImmutableReminderV2Get) => Promise<{
      success: boolean;
      code?: string;
      data?: { status: "COMMITTED"; reminder: ReturnType<typeof saved> };
    }>
  >
>;
let generate: ReturnType<typeof vi.fn<() => string>>;
function make() {
  const deps: ReminderV49MockDependencies = {
    store: memory.store,
    uuidV4: generate,
    postMock: post,
    lookupMock: lookup,
  };
  return createReminderV49DurableReview(deps);
}
beforeEach(() => {
  vi.clearAllMocks();
  memory = mockStore();
  post = vi
    .fn<
      (
        request: ImmutableReminderV2Post,
      ) => Promise<{ success: boolean; data?: ReturnType<typeof saved>; code?: string }>
    >()
    .mockResolvedValue({ success: true, data: saved() });
  lookup = vi
    .fn<
      (request: ImmutableReminderV2Get) => Promise<{
        success: boolean;
        code?: string;
        data?: { status: "COMMITTED"; reminder: ReturnType<typeof saved> };
      }>
    >()
    .mockResolvedValue({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
  generate = vi.fn<() => string>(() => KEY);
});
describe("AG3 V49 cold-restart Reminder durable UNKNOWN source/mock", () => {
  it("atomic UNKNOWN durable reserve + roundtrip happens BEFORE any POST bytes; four fields, no PII", async () => {
    const gate = make();
    expect(await gate.restore(actor(), () => true)).toBe("ready");
    post.mockImplementationOnce(async (req) => {
      expect(memory.get()).toEqual({
        ownerId: "A",
        authEpoch: "E1",
        idempotencyKey: KEY,
        status: "UNKNOWN",
      });
      expect(req).toEqual({
        method: "POST",
        path: "/api/v1/reminders",
        headers: { "Idempotency-Key": KEY },
        body: {
          name: "Прогулка",
          reminderTime: "09:00",
          reminderDays: "1,3",
          timezone: "Europe/Moscow",
        },
        requestGuard: expect.any(Function),
      });
      return { success: true, data: saved() };
    });
    expect((await gate.create(actor(), draft(), () => true)).kind).toBe("acknowledged");
    expect(generate).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
    expect(Object.keys(memory.get() as object).sort()).toEqual(
      ["ownerId", "authEpoch", "idempotencyKey", "status"].sort(),
    );
    expect(JSON.stringify(memory.get())).not.toMatch(
      /Прогулка|09:00|reminderDays|timezone|clientRequestId|bearer|payload|token/,
    );
  });
  it("lost response may mean committed, survives NEW instance restart, zero new POST or new UUID", async () => {
    post.mockRejectedValueOnce(new Error("PRIVATE_POST_BODY"));
    const first = make();
    await first.restore(actor(), () => true);
    expect(await first.create(actor(), draft(), () => true)).toEqual({ kind: "unknown" });
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    const restarted = make();
    expect(await restarted.restore(actor(), () => true)).toBe("unknown");
    expect(await restarted.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
  });
  it("crash in pending POST after reservation: restart same original key UNKNOWN, no POST", async () => {
    const d = wait<{ success: boolean; data: ReturnType<typeof saved> }>();
    post.mockReturnValueOnce(d.promise);
    const first = make();
    await first.restore(actor(), () => true);
    const pending = first.create(actor(), draft(), () => true);
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    const restarted = make();
    expect(await restarted.restore(actor(), () => true)).toBe("unknown");
    expect(await restarted.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    d.resolve({ success: true, data: saved() });
    expect((await pending).kind).toBe("acknowledged");
    expect(post).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
  });
  it("owner B and A/E2 quarantine A/E1 UNKNOWN, no receipt lookup, UI cannot read old key", async () => {
    const first = make();
    await first.restore(actor(), () => true);
    post.mockRejectedValueOnce(new Error("ACK_LOST"));
    await first.create(actor(), draft(), () => true);
    const other = make();
    expect(await other.restore(actor("B1", "B"), () => true)).toBe("quarantined");
    expect(await other.manualLookup(actor("B1", "B"), () => true)).toEqual({ kind: "blocked" });
    const epoch = make();
    expect(await epoch.restore(actor("E2"), () => true)).toBe("quarantined");
    expect(await epoch.create(actor("E2"), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(lookup).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledOnce();
  });
  it("storage LOAD failure, corrupted record, extra keys fail closed BEFORE UUID allocation", async () => {
    memory.store.load = vi.fn().mockRejectedValue(new Error("PRIVATE_STORE_ERROR"));
    const faulty = make();
    expect(await faulty.restore(actor(), () => true)).toBe("blocked");
    expect(await faulty.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    memory = mockStore();
    memory.put({
      ...{ ownerId: "A", authEpoch: "E1", idempotencyKey: KEY, status: "UNKNOWN" },
      name: "PII",
    });
    const invalid = make();
    expect(await invalid.restore(actor(), () => true)).toBe("blocked");
    expect(await invalid.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("atomic reservation failure or write exception => no POST, no bypass", async () => {
    const first = make();
    await first.restore(actor(), () => true);
    memory.store.reserve = vi.fn().mockResolvedValue(false);
    expect(await first.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    memory = mockStore();
    memory.store.reserve = vi.fn().mockRejectedValue(new Error("PRIVATE_WRITE"));
    const second = make();
    await second.restore(actor(), () => true);
    expect(await second.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
  it("storage verification read failure after reserve => no network bytes, fail closed", async () => {
    const first = make();
    await first.restore(actor(), () => true);
    memory.store.load = vi.fn().mockRejectedValue(new Error("READBACK_FAIL"));
    expect(await first.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
  it("CAP400 records rejected_cap; 409 conflict and invalid400 distinct terminal records on restart", async () => {
    const cases = [
      ["REMINDER_LIMIT_REACHED", "REJECTED_CAP", "rejected_cap"],
      ["REMINDER_IDEMPOTENCY_CONFLICT", "TERMINAL_CONFLICT", "terminal_conflict"],
      ["REMINDER_IDEMPOTENCY_INVALID", "TERMINAL_INVALID", "terminal_invalid"],
    ] as const;
    for (const [code, status, phase] of cases) {
      memory = mockStore();
      post.mockReset().mockResolvedValue({ success: false, code });
      const gate = make();
      await gate.restore(actor(), () => true);
      const outcome = await gate.create(actor(), draft(), () => true);
      expect(outcome.kind).toBe(code === "REMINDER_LIMIT_REACHED" ? "rejected" : "terminal");
      expect((memory.get() as ReminderV49Record).status).toBe(status);
      expect(await make().restore(actor(), () => true)).toBe(phase);
    }
  });
  it("canonical owner GET 404 including expired/tombstoned/foreign remains UNKNOWN forever", async () => {
    const gate = make();
    await gate.restore(actor(), () => true);
    post.mockRejectedValueOnce(new Error("ACK_LOST"));
    await gate.create(actor(), draft(), () => true);
    expect(await gate.manualLookup(actor(), () => true)).toEqual({ kind: "unknown" });
    expect(lookup).toHaveBeenCalledExactlyOnceWith({
      method: "GET",
      path: `/api/v1/reminders/operations/${KEY}`,
      requestGuard: expect.any(Function),
    });
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    const restarted = make();
    expect(await restarted.restore(actor(), () => true)).toBe("unknown");
    expect(await restarted.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).toHaveBeenCalledOnce();
  });
  it("cold restore 200 COMMITTED without old payload is GATED, not forged confirmed", async () => {
    memory.put({ ownerId: "A", authEpoch: "E1", idempotencyKey: KEY, status: "UNKNOWN" });
    lookup.mockResolvedValueOnce({
      success: true,
      data: { status: "COMMITTED", reminder: saved() },
    });
    const gate = make();
    expect(await gate.restore(actor(), () => true)).toBe("unknown");
    expect(await gate.manualLookup(actor(), () => true)).toEqual({ kind: "gated" });
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    expect(post).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("no authorized lookup transport => gated, NOT a new POST", async () => {
    memory.put({ ownerId: "A", authEpoch: "E1", idempotencyKey: KEY, status: "UNKNOWN" });
    const noLookup = createReminderV49DurableReview({
      store: memory.store,
      uuidV4: generate,
      postMock: post,
    });
    expect(await noLookup.restore(actor(), () => true)).toBe("unknown");
    expect(await noLookup.manualLookup(actor(), () => true)).toEqual({ kind: "gated" });
    expect(post).not.toHaveBeenCalled();
  });
  it("authoritative ACK id and exact owner list confirms only after durable CAS+readback", async () => {
    const gate = make();
    await gate.restore(actor(), () => true);
    expect((await gate.create(actor(), draft(), () => true)).kind).toBe("acknowledged");
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    expect(await gate.confirmList(actor(), [{ ...saved(), id: "other" }], () => true)).toEqual({
      kind: "unknown",
    });
    // Need a separate intent to verify a positive readback: unknown is terminal for this attempt.
    memory = mockStore();
    const approved = make();
    await approved.restore(actor(), () => true);
    expect((await approved.create(actor(), draft(), () => true)).kind).toBe("acknowledged");
    expect(await approved.confirmList(actor(), [saved()], () => true)).toEqual({
      kind: "confirmed",
      reminder: saved(),
    });
    expect((memory.get() as ReminderV49Record).status).toBe("CONFIRMED");
    expect(await make().restore(actor(), () => true)).toBe("confirmed");
  });
  it("CAS transition rejection or verify failure preserves durable UNKNOWN; no false success", async () => {
    const gate = make();
    await gate.restore(actor(), () => true);
    await gate.create(actor(), draft(), () => true);
    memory.store.transition = vi.fn().mockResolvedValue(false);
    expect(await gate.confirmList(actor(), [saved()], () => true)).toEqual({ kind: "blocked" });
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    expect(post).toHaveBeenCalledOnce();
  });
  it("unknown same owner attempts are singleflight, two taps one key and one POST", async () => {
    const d = wait<{ success: boolean; data: ReturnType<typeof saved> }>();
    post.mockReturnValueOnce(d.promise);
    const gate = make();
    await gate.restore(actor(), () => true);
    const first = gate.create(actor(), draft(), () => true);
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    d.resolve({ success: true, data: saved() });
    expect((await first).kind).toBe("acknowledged");
    expect(post).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
  });
  it("epoch changes DURING async durable reserve: abort before POST, UNKNOWN retained", async () => {
    const gate = make();
    await gate.restore(actor(), () => true);
    const hold = wait<boolean>();
    memory.store.reserve = vi.fn(async (record) => {
      memory.put(record);
      return hold.promise;
    });
    let epoch = "E1";
    const pending = gate.create(actor(), draft(), () => epoch === "E1");
    epoch = "B1";
    epoch = "E2";
    hold.resolve(true);
    expect(await pending).toEqual({ kind: "stale" });
    expect(post).not.toHaveBeenCalled();
    expect((memory.get() as ReminderV49Record).status).toBe("UNKNOWN");
    expect(await make().restore(actor("E2"), () => true)).toBe("quarantined");
  });
  it("corrupt invalid UUID, status and owner fields are blocked, never silently cleared", async () => {
    const invalid = [
      { ownerId: "A", authEpoch: "E1", idempotencyKey: "not-uuid", status: "UNKNOWN" },
      { ownerId: "A", authEpoch: "E1", idempotencyKey: KEY, status: "FAILED" },
      { ownerId: "", authEpoch: "E1", idempotencyKey: KEY, status: "UNKNOWN" },
    ];
    for (const value of invalid) {
      memory = mockStore();
      memory.put(value);
      const gate = make();
      expect(await gate.restore(actor(), () => true)).toBe("blocked");
      expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    }
    expect(post).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("neither storage nor tracer serializes reminder text, JWT, original error or ID key", async () => {
    const gate = make();
    await gate.restore(actor(), () => true);
    post.mockRejectedValueOnce(
      new Error(`JWT secret /api/v1/reminders/operations/${KEY} Прогулка`),
    );
    await gate.create(actor(), draft(), () => true);
    expect(JSON.stringify(memory.get())).not.toMatch(/Прогулка|reminderTime|secret|JWT/);
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toMatch(
      /Прогулка|4bc11bb9|JWT|secret|ownerId|authEpoch/,
    );
  });
});
