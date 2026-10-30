import { describe, it, expect, vi } from "vitest";
import {
  makeReminderV2DurableMock,
  makeReminderV2FakeAsyncCAS,
  type DurableMarker,
  type DurableCASStore,
} from "./reminderV2DurableSourceMock";
const scope = "psn_aaaaaaaa1111111111bbbbbb";
const epoch = "epoch_fixture_20261018_aaaa";
const owner2 = "psn_bbbbbbbb2222222222aaaaaa";
const epoch2 = "epoch_fixture_20261018_bbbb";
const key = "f003b513-ae45-4f09-92db-0f4874b67e81";
const key2 = "c123b513-ae45-4f09-92db-0f4874b67e81";
const start = 1792324800000;
const create = (
  store: DurableCASStore,
  config?: {
    ownerScope?: string;
    authEpoch?: string;
    now?: () => number;
  },
) =>
  makeReminderV2DurableMock({
    store,
    ownerScope: config?.ownerScope ?? scope,
    authEpoch: config?.authEpoch ?? epoch,
    now: config?.now ?? (() => start),
  });
const sample: DurableMarker = {
  schemaVersion: 1,
  ownerScope: scope,
  authEpoch: epoch,
  operationKey: key,
  phase: "MAY_HAVE_SENT",
  createdAt: start,
  lastSeenAt: start,
};
describe("AG4 AG2 Reminder durable source/mock CAS (NO real browser storage)", () => {
  it("D01 CAS saves minimal PREPARED then MAY_HAVE_SENT before any synthetic POST", async () => {
    const db = makeReminderV2FakeAsyncCAS();
    const ctrl = create(db);
    expect(await ctrl.read()).toEqual({ kind: "empty" });
    const prepared = await ctrl.reserve(key);
    expect(prepared).toMatchObject({
      schemaVersion: 1,
      phase: "PREPARED",
      operationKey: key,
      ownerScope: scope,
      authEpoch: epoch,
    });
    expect(await db.read()).toEqual(prepared);
    const ready = await ctrl.beforeSend(prepared!);
    expect(ready?.phase).toBe("MAY_HAVE_SENT");
    expect(await db.read()).toEqual(ready);
    const raw = JSON.stringify(await db.read());
    for (const excluded of [
      "name",
      "reminderTime",
      "reminderDays",
      "timezone",
      "ownerId",
      "userId",
      "JWT",
      "cookie",
      "SECRET_",
      "email",
      "authToken",
      "payload",
    ]) {
      expect(raw).not.toContain(excluded);
    }
    expect(Object.keys((await db.read()) as object).sort()).toEqual(
      [
        "schemaVersion",
        "ownerScope",
        "authEpoch",
        "operationKey",
        "phase",
        "createdAt",
        "lastSeenAt",
      ].sort(),
    );
  });
  it("D02 cold restart PREPARED is owned unresolved; cannot reserve again", async () => {
    const db = makeReminderV2FakeAsyncCAS();
    await create(db).reserve(key);
    const recovered = create(db);
    const result = await recovered.read();
    expect(result.kind).toBe("owned");
    if (result.kind === "owned") expect(result.marker.phase).toBe("PREPARED");
    expect(await recovered.reserve(key2)).toBeNull();
  });
  it("D03 cold restart MAY_HAVE_SENT remains unresolved; no re-PREPARE", async () => {
    const db = makeReminderV2FakeAsyncCAS(sample);
    expect((await create(db).read()).kind).toBe("owned");
    expect(await create(db).reserve(key2)).toBeNull();
  });
  it("D04 two concurrent tabs CAS exactly one reservation", async () => {
    const db = makeReminderV2FakeAsyncCAS();
    const [a, b] = await Promise.all([create(db).reserve(key), create(db).reserve(key2)]);
    expect(Number(Boolean(a)) + Number(Boolean(b))).toBe(1);
    expect([key, key2]).toContain(((await db.read()) as DurableMarker).operationKey);
  });
  it("D05 wrong owner, same owner wrong epoch quarantines forever", async () => {
    const db = makeReminderV2FakeAsyncCAS(sample);
    expect(await create(db, { ownerScope: owner2 }).read()).toEqual({
      kind: "quarantined",
    });
    expect(await create(db, { authEpoch: epoch2 }).read()).toEqual({
      kind: "quarantined",
    });
    expect(await create(db, { ownerScope: owner2 }).reserve(key2)).toBeNull();
    expect(await create(db, { authEpoch: epoch2 }).reserve(key2)).toBeNull();
  });
  it("D06 expired 30-day receipt quarantined, never an empty slot", async () => {
    const db = makeReminderV2FakeAsyncCAS(sample);
    const ctr = create(db, { now: () => start + 31 * 24 * 3600000 });
    expect((await ctr.read()).kind).toBe("quarantined");
    expect(await ctr.reserve(key2)).toBeNull();
  });
  it("D07 corrupt JSON or schema version blocks new sends", async () => {
    for (const broken of [
      false,
      {},
      [],
      { ...sample, schemaVersion: 2 },
      { ...sample, operationKey: "INVALID" },
      { ...sample, extra: "SECRET_MEDICAL" },
      { ...sample, createdAt: start + 24 * 3600000 },
    ]) {
      const ctr = create(makeReminderV2FakeAsyncCAS(broken));
      expect(await ctr.read()).toEqual({ kind: "fault" });
      expect(await ctr.reserve(key2)).toBeNull();
    }
  });
  it("D08 missing/invalid opaque owner/epoch never stores or sends", async () => {
    for (const cfg of [
      { ownerScope: "A" },
      { authEpoch: "ownerA" },
      { ownerScope: "owner_email@example.com" },
    ]) {
      const ctr = create(makeReminderV2FakeAsyncCAS(), cfg);
      expect((await ctr.read()).kind).toBe("fault");
      expect(await ctr.reserve(key)).toBeNull();
    }
  });
  it("D09 storage read fault => no reservation, no transition", async () => {
    const storage: DurableCASStore = {
      read: vi.fn(async () => {
        throw Error("SECRET_STORAGE_DENIED");
      }),
      compareAndSwap: vi.fn(async () => true),
    };
    const ctr = create(storage);
    expect((await ctr.read()).kind).toBe("fault");
    expect(await ctr.reserve(key)).toBeNull();
    expect(storage.compareAndSwap).not.toHaveBeenCalled();
  });
  it("D10 CAS write denied or post-write readback failure blocks", async () => {
    const denied: DurableCASStore = {
      read: async () => null,
      compareAndSwap: async () => {
        throw Error("SECRET_QUOTA");
      },
    };
    expect(await create(denied).reserve(key)).toBeNull();
    let step = 0;
    const rollback: DurableCASStore = {
      read: async () => {
        step++;
        return step === 1 ? null : false;
      },
      compareAndSwap: async () => true,
    };
    expect(await create(rollback).reserve(key)).toBeNull();
  });
  it("D11 MAY_HAVE_SENT transition failure blocks; no optimistic mark", async () => {
    const db = makeReminderV2FakeAsyncCAS(sample);
    const c = create(db);
    expect(await c.beforeSend(sample)).toBeNull();
    const saved = await c.mark(sample, "UNKNOWN");
    expect(saved?.phase).toBe("UNKNOWN");
    expect(await db.read()).toEqual(saved);
    expect(await c.mark(sample, "COMMITTED")).toBeNull();
  });
  it("D11b restored PREPARED only owner-manual readback may COMMIT, not replay", async () => {
    const db = makeReminderV2FakeAsyncCAS();
    const c = create(db);
    const prepared = await c.reserve(key);
    expect(prepared).not.toBeNull();
    expect(await c.mark(prepared!, "REJECTED")).toBeNull();
    expect(((await db.read()) as DurableMarker).phase).toBe("PREPARED");
    expect((await c.mark(prepared!, "SERVER_COMMITTED_UNVERIFIED_DRAFT"))?.phase).toBe(
      "SERVER_COMMITTED_UNVERIFIED_DRAFT",
    );
    expect(await c.beforeSend(prepared!)).toBeNull();
  });
  it("D13 marker semantic: 200 owner-key proof is never EXACT_CONFIRMED", async () => {
    const db = makeReminderV2FakeAsyncCAS(sample);
    const c = create(db);
    const confirmed = await c.mark(sample, "SERVER_COMMITTED_UNVERIFIED_DRAFT");
    expect(confirmed?.phase).toBe("SERVER_COMMITTED_UNVERIFIED_DRAFT");
    expect(await db.read()).toEqual(confirmed);
    expect(JSON.stringify(await db.read())).not.toContain("EXACT_CONFIRMED");
    expect(await c.mark(sample, "UNKNOWN")).toBeNull();
    expect(await c.reserve(key2)).toBeNull();
  });
  it("D12 source mock never exposes real storage; only injected CAS APIs", () => {
    const db = makeReminderV2FakeAsyncCAS();
    expect(Object.keys(db).sort()).toEqual(["compareAndSwap", "read"]);
    expect(db).not.toHaveProperty("localStorage");
    expect(db).not.toHaveProperty("indexedDB");
  });
});
