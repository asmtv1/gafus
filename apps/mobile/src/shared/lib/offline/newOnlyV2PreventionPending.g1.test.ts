import { describe, expect, it, vi } from "vitest";
import { readOwnPendingPrevention } from "./newOnlyV2PreventionPending";
import type { NewOnlyV2Queues, V2SessionBinding } from "./newOnlyV2Queues";

const A: V2SessionBinding = {
  schemaVersion: 2,
  principalId: "USER_A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
const B: V2SessionBinding = {
  schemaVersion: 2,
  principalId: "USER_B",
  authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029",
};
const event = {
  eventId: "8ae52e9a-580f-4ab8-9545-397973bc32f5",
  kind: "prevention.upsert",
  createdAt: 1,
  payload: {
    petId: "pet-A",
    entries: [{ type: "VACCINATION", performedAt: "2026-10-17T00:00:00.000Z" }],
  },
};
function setup(binding: V2SessionBinding | null = A, entries: unknown[] = [event]) {
  let current = binding;
  const getVerifiedBinding = vi.fn(() => current);
  const getPending = vi.fn(async () => entries);
  const store = { getVerifiedBinding, getPending } as unknown as NewOnlyV2Queues;
  return {
    store,
    getPending,
    switchTo: (next: V2SessionBinding | null) => {
      current = next;
    },
  };
}
describe("AG3 OFF021 owner-scoped prevention preview (Phase1 read-only)", () => {
  it("filters other pets and reveals only minimal local fields", async () => {
    const s = setup(A, [
      event,
      { ...event, eventId: "other", payload: { ...event.payload, petId: "pet-B" } },
    ]);
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([
      { eventId: event.eventId, type: "VACCINATION", performedAt: "2026-10-17T00:00:00.000Z" },
    ]);
  });
  it("never reads unverified or mismatched owner", async () => {
    const s = setup(null);
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([]);
    s.switchTo(B);
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([]);
    expect(s.getPending).not.toHaveBeenCalled();
  });
  it("discards results if logout or owner changes during read", async () => {
    const s = setup();
    s.getPending.mockImplementationOnce(async () => {
      s.switchTo(B);
      return [event];
    });
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([]);
  });
  it("discards old epoch results after re-login same owner", async () => {
    const s = setup();
    s.getPending.mockImplementationOnce(async () => {
      s.switchTo({ ...A, authEpoch: B.authEpoch });
      return [event];
    });
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([]);
  });
  it("rejects damaged entry shapes, never mutates queue", async () => {
    const s = setup(A, [
      { ...event, payload: { petId: "pet-A", entries: [null] } },
      {
        ...event,
        payload: { petId: "pet-A", entries: [{ type: "VACCINATION", performedAt: "broken" }] },
      },
    ]);
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toEqual([]);
    expect(s.getPending).toHaveBeenCalledTimes(1);
  });
  it("rejects corrupt storage without leaking and permits re-read after restart", async () => {
    const s = setup();
    s.getPending.mockRejectedValueOnce(new Error("V2_QUARANTINED"));
    await expect(readOwnPendingPrevention(s.store, "pet-A", "USER_A")).rejects.toThrow(
      "V2_QUARANTINED",
    );
    expect(await readOwnPendingPrevention(s.store, "pet-A", "USER_A")).toHaveLength(1);
  });
});
