import { describe, it, expect, vi } from "vitest";
import {
  createBookingTombstoneStore,
  type BookingTombstoneBinding,
} from "./bookingDurableTombstone";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "7bd6012c-bf44-4ed3-bbea-24d32d48a6a3";
const UUID = "e3519bbb-9e37-4eb2-bdd7-060268c5b66c";
const OTHER = "a5626a73-405d-496e-b458-2368987c4d21";
function make() {
  const disk = new Map<string, string>([
    ["progress-sync-storage", "legacy-preserved"],
    ["gafus-progress-v2:A:" + E1, "phase1-preserved"],
  ]);
  const calls: string[] = [];
  let binding: BookingTombstoneBinding = { principalId: "A", authEpoch: E1 };
  let now = 1792252800000,
    writeFault = false,
    readFault = false,
    readbackFault = false;
  let beforeWrite: (() => Promise<void>) | null = null;
  const deps = {
    storage: {
      getItem: vi.fn(async (key: string) => {
        calls.push("read:" + key);
        if (readFault || (readbackFault && calls.some((x) => x.startsWith("write:"))))
          throw Error("READ_FAULT");
        return disk.get(key) ?? null;
      }),
      setItem: vi.fn(async (key: string, value: string) => {
        calls.push("write:" + key);
        if (beforeWrite) await beforeWrite();
        if (writeFault) throw Error("DISK_FULL");
        disk.set(key, value);
      }),
    },
    getBinding: () => binding,
    now: () => now,
  };
  return {
    disk,
    calls,
    deps,
    store: createBookingTombstoneStore(deps),
    restart: () => createBookingTombstoneStore(deps),
    binding: (b: BookingTombstoneBinding) => {
      binding = b;
    },
    now: (n: number) => {
      now = n;
    },
    writeFault: (f: boolean) => {
      writeFault = f;
    },
    readFault: (f: boolean) => {
      readFault = f;
    },
    readbackFault: (f: boolean) => {
      readbackFault = f;
    },
    blockWrite: (p: () => Promise<void>) => {
      beforeWrite = p;
    },
    preserved: () => {
      expect(disk.get("progress-sync-storage")).toBe("legacy-preserved");
      expect(disk.get("gafus-progress-v2:A:" + E1)).toBe("phase1-preserved");
      expect(calls.every((x) => x.includes("gafus-consultation-booking-tombstone-v1:"))).toBe(true);
    },
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("new-only booking durable UNKNOWN tombstone — no PII, no replay", () => {
  it("prepare before POST exact receipt; cold restart blocked with same E1, no intake fields in bytes", async () => {
    const f = make();
    expect(await f.store.read("A", E1)).toEqual({ status: "CLEAR" });
    expect(await f.store.prepareBeforePost("A", E1, UUID)).toBe("READY");
    const restarted = await f.restart().read("A", E1);
    expect(restarted.status).toBe("UNKNOWN");
    if (restarted.status === "UNKNOWN") expect(restarted.record.idempotencyKey).toBe(UUID);
    expect(await f.restart().prepareBeforePost("A", E1, OTHER)).toBe("BLOCKED");
    const only = f.disk.entries().next().value;
    expect(only).toBeDefined();
    const raw = [...f.disk.values()].find((x) => x.includes(UUID))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "authEpoch",
      "createdAt",
      "idempotencyKey",
      "ownerId",
      "state",
      "version",
    ]);
    expect(raw).not.toMatch(
      /Анна|Бим|7999|petName|clientPhone|clientProblem|slotId|token|password/,
    );
    f.preserved();
  });
  it("setItem fails, write can still commit then throw: no ready; next restart sees UNKNOWN", async () => {
    const f = make();
    f.writeFault(true);
    expect(await f.store.prepareBeforePost("A", E1, UUID)).toBe("UNAVAILABLE");
    expect(await f.store.read("A", E1)).toEqual({ status: "CLEAR" });
    const g = make();
    const original = g.deps.storage.setItem;
    g.deps.storage.setItem = vi.fn(async (key: string, value: string) => {
      await original(key, value);
      throw Error("ACK_LOST_AFTER_WRITE");
    });
    expect(await g.store.prepareBeforePost("A", E1, UUID)).toBe("UNAVAILABLE");
    expect((await g.restart().read("A", E1)).status).toBe("UNKNOWN");
    f.preserved();
    g.preserved();
  });
  it("read/write readback fault is fail closed, never interprets error as CLEAR", async () => {
    const f = make();
    f.readFault(true);
    expect((await f.store.read("A", E1)).status).toBe("UNAVAILABLE");
    expect(await f.store.prepareBeforePost("A", E1, UUID)).toBe("UNAVAILABLE");
    expect(f.calls.some((x) => x.startsWith("write:"))).toBe(false);
    f.readFault(false);
    f.readbackFault(true);
    expect(await f.store.prepareBeforePost("A", E1, UUID)).toBe("UNAVAILABLE");
    f.readbackFault(false);
    expect((await f.restart().read("A", E1)).status).toBe("UNKNOWN");
    f.preserved();
  });
  it("same owner new E2/foreign B never read, copy, delete, or rewrite E1; E2 initially clear", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    const oldKey = [...f.disk.keys()].find((x) => x.includes("tombstone"))!;
    const old = f.disk.get(oldKey);
    f.binding({ principalId: "A", authEpoch: E2 });
    expect((await f.restart().read("A", E2)).status).toBe("CLEAR");
    expect((await f.restart().read("A", E1)).status).toBe("UNAVAILABLE");
    expect(await f.restart().prepareBeforePost("A", E2, OTHER)).toBe("READY");
    f.binding({ principalId: "B", authEpoch: E2 });
    expect((await f.restart().read("A", E2)).status).toBe("UNAVAILABLE");
    expect((await f.restart().read("B", E2)).status).toBe("CLEAR");
    expect(f.disk.get(oldKey)).toBe(old);
    f.preserved();
  });
  it("interrupted async persist owner/epoch rotates midwrite => NOT READY, old marker quarantined", async () => {
    const f = make();
    const pending = deferred();
    f.blockWrite(() => pending.promise);
    const promise = f.store.prepareBeforePost("A", E1, UUID);
    // Wait for the writer to be entered without relying on arbitrary delays.
    for (let i = 0; i < 16 && !f.calls.some((x) => x.startsWith("write:")); i++)
      await Promise.resolve();
    expect(f.calls.some((x) => x.startsWith("write:"))).toBe(true);
    f.binding({ principalId: "A", authEpoch: E2 });
    pending.resolve();
    expect(await promise).toBe("UNAVAILABLE");
    expect((await f.store.read("A", E2)).status).toBe("CLEAR");
    f.binding({ principalId: "A", authEpoch: E1 });
    expect((await f.restart().read("A", E1)).status).toBe("UNKNOWN");
    f.preserved();
  });
  it("24h expiry is warning only: no clearing, no automatic new intent, even at 25h", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    f.now(1792252800000 + 25 * 3600_000);
    expect((await f.restart().read("A", E1)).status).toBe("EXPIRED");
    expect(await f.restart().prepareBeforePost("A", E1, OTHER)).toBe("BLOCKED");
    f.preserved();
  });
  it("positive acknowledgment alone records CONFIRMED; false/foreign/old UUID cannot clear UNKNOWN", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    expect(await f.store.confirmAcknowledged("A", E1, OTHER)).toBe(false);
    expect((await f.store.read("A", E1)).status).toBe("UNKNOWN");
    expect(await f.store.confirmAcknowledged("A", E1, UUID)).toBe(true);
    expect((await f.restart().read("A", E1)).status).toBe("CONFIRMED");
    expect(await f.restart().prepareBeforePost("A", E1, OTHER)).toBe("READY");
    f.preserved();
  });
  it("definite pre-commit REJECTED has same six fields, allows new explicit key only after exact durable readback", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    expect(await f.store.rejectBeforeCommit("A", E1, OTHER)).toBe(false);
    expect((await f.store.read("A", E1)).status).toBe("UNKNOWN");
    expect(await f.store.rejectBeforeCommit("A", E1, UUID)).toBe(true);
    const result = await f.restart().read("A", E1);
    expect(result.status).toBe("REJECTED");
    expect(JSON.parse([...f.disk.values()].find((v) => v.includes(UUID))!).state).toBe("REJECTED");
    expect(await f.store.prepareBeforePost("A", E1, OTHER)).toBe("READY");
    expect((await f.store.read("A", E1)).status).toBe("UNKNOWN");
    f.preserved();
  });
  it("failed rejection storage write retains UNKNOWN; owner switch cannot reject earlier epoch", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    f.writeFault(true);
    expect(await f.store.rejectBeforeCommit("A", E1, UUID)).toBe(false);
    expect((await f.store.read("A", E1)).status).toBe("UNKNOWN");
    f.writeFault(false);
    f.binding({ principalId: "A", authEpoch: E2 });
    expect(await f.store.rejectBeforeCommit("A", E1, UUID)).toBe(false);
    expect((await f.store.read("A", E2)).status).toBe("CLEAR");
    f.binding({ principalId: "A", authEpoch: E1 });
    expect((await f.restart().read("A", E1)).status).toBe("UNKNOWN");
    f.preserved();
  });
  it("confirmed readback is idempotent only for same UUID/verified session after storage ACK loss", async () => {
    const f = make();
    await f.store.prepareBeforePost("A", E1, UUID);
    expect(await f.store.confirmAcknowledged("A", E1, UUID)).toBe(true);
    expect(await f.restart().confirmAcknowledged("A", E1, UUID)).toBe(true);
    expect(await f.restart().confirmAcknowledged("A", E1, OTHER)).toBe(false);
    f.binding({ principalId: "A", authEpoch: E2 });
    expect(await f.restart().confirmAcknowledged("A", E1, UUID)).toBe(false);
    f.binding({ principalId: "A", authEpoch: E1 });
    expect((await f.restart().read("A", E1)).status).toBe("CONFIRMED");
    f.preserved();
  });
  it("invalid, corrupt, unexpected PII fields and future timestamp fail closed, without deletion", async () => {
    const f = make();
    expect(await f.store.prepareBeforePost("A", E1, "invalid")).toBe("UNAVAILABLE");
    await f.store.prepareBeforePost("A", E1, UUID);
    const key = [...f.disk.keys()].find((x) => x.includes("tombstone"))!;
    const good = JSON.parse(f.disk.get(key)!);
    f.disk.set(key, JSON.stringify({ ...good, clientPhone: "+79991234567" }));
    expect((await f.store.read("A", E1)).status).toBe("UNAVAILABLE");
    f.disk.set(key, "not-json");
    expect((await f.store.read("A", E1)).status).toBe("UNAVAILABLE");
    f.disk.set(key, JSON.stringify({ ...good, createdAt: good.createdAt + 10 * 60_000 }));
    expect((await f.store.read("A", E1)).status).toBe("UNAVAILABLE");
    f.preserved();
  });
});
