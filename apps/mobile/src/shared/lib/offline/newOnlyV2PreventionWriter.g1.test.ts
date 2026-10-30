import { describe, expect, it, vi } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";
import { enqueueNewOnlyPrevention } from "./newOnlyV2PreventionWriter";
import { preparePreventionJournalContract } from "./newOnlyV2PreventionContract";

const OWNER = "USER_A";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "d8f37921-b880-4b04-ae14-96c2e749b029";
const ID1 = "23a47d4c-9b22-4f0b-a0e6-06d634e7a701";
const ID2 = "71243d0c-a88f-4999-b74e-0c72f38782f1";
const PROBE = "346ed6e4-bfa1-4b3b-88da-5b0f9017cae7";
const BATCH = "8ae52e9a-580f-4ab8-9545-397973bc32f5";
const OLD = {
  "prevention-sync-storage": "{historic-v1-prevention-unknown-owner}",
  "progress-sync-storage": "{historic-v1-progress-unknown-owner}",
  "offline-storage": "{historic-v1-offline-media}",
};
const dto = {
  type: "VACCINATION" as const,
  performedAt: "2026-10-17",
  productName: "Test",
  notes: "",
  reminderEnabled: true,
  reminderKind: "ON_DATE" as const,
  reminderOnDate: "2026-11-17",
  reminderTimes: ["09:00"],
};
function harness() {
  const values = new Map<string, string>(Object.entries(OLD));
  const secrets = new Map<string, string>();
  const writes: string[] = [];
  const ids = [E1, ID1, ID2, PROBE, BATCH];
  const store = createNewOnlyV2Queues({
    storage: {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, raw) => {
        writes.push(key);
        values.set(key, raw);
      },
    },
    secure: {
      getItemAsync: async (key) => secrets.get(key) ?? null,
      setItemAsync: async (key, raw) => {
        secrets.set(key, raw);
      },
      deleteItemAsync: async (key) => {
        secrets.delete(key);
      },
    },
    makeId: () => {
      const v = ids.shift();
      if (!v) throw Error("FIXTURE_EXHAUSTED");
      return v;
    },
    now: () => 1720000000000,
  });
  const assertOld = () => {
    for (const [k, v] of Object.entries(OLD)) expect(values.get(k)).toBe(v);
    expect(writes.every((k) => k.startsWith("gafus-prevention-v2:"))).toBe(true);
  };
  return {
    store,
    values,
    secrets,
    writes,
    assertOld,
    makeId: () => {
      const id = ids.shift();
      if (!id) throw Error("FIXTURE_EXHAUSTED");
      return id;
    },
  };
}
describe("AG3 OFF021 new-only prevention fresh writer P1", () => {
  it("enqueues one valid server-shape prevention item with separate stable clientId/eventId and no legacy writes", async () => {
    const h = harness();
    await h.store.beginVerifiedLogin(OWNER);
    const receipt = await enqueueNewOnlyPrevention(h.store, "pet-A", dto, h.makeId);
    expect(receipt.eventId).toBe(BATCH);
    expect(receipt.ownerId).toBe(OWNER);
    expect(receipt.authEpoch).toBe(E1);
    const key = "gafus-prevention-v2:" + OWNER + ":" + E1;
    const raw = h.values.get(key);
    expect(raw).toBeTruthy();
    const [saved] = await h.store.getPending("prevention");
    expect(saved.eventId).toBe(BATCH);
    expect(saved.payload).toEqual({
      petId: "pet-A",
      entries: [
        {
          eventId: ID1,
          clientId: ID2,
          type: "VACCINATION",
          performedAt: "2026-10-17T00:00:00.000Z",
          productName: "Test",
          notes: "",
          reminderEnabled: true,
          reminderKind: "ON_DATE",
          reminderOnDate: "2026-11-17T00:00:00.000Z",
          reminderTimes: ["09:00"],
        },
      ],
    });
    const verified = h.store.getVerifiedBinding()!;
    const descriptor = preparePreventionJournalContract(
      { binding: verified, event: saved },
      verified,
    );
    expect(descriptor.post.body.eventId).toBe(BATCH);
    expect(descriptor.post.body.entries[0].clientId).toBe(ID2);
    expect(descriptor.post.body.entries[0].eventId).toBe(ID1);
    expect(descriptor.post.path).toBe("/api/v1/offline/mutations");
    h.assertOld();
    expect(h.writes).toEqual([key]);
  });
  it("requires a server-verified owner and leaves form data and legacy bytes intact when missing", async () => {
    const h = harness();
    await expect(enqueueNewOnlyPrevention(h.store, "pet-A", dto, h.makeId)).rejects.toMatchObject({
      code: "V2_SESSION_UNVERIFIED",
    });
    expect(h.writes).toEqual([]);
    h.assertOld();
  });
  it.each(["2026-02-30", "not-a-date", "2026-13-01"])(
    "rejects invalid performedAt %s before any durable storage write",
    async (date) => {
      const h = harness();
      await h.store.beginVerifiedLogin(OWNER);
      await expect(
        enqueueNewOnlyPrevention(h.store, "pet-A", { ...dto, performedAt: date }, h.makeId),
      ).rejects.toThrow();
      expect(h.writes).toHaveLength(0);
      h.assertOld();
    },
  );
  it("refuses bad reminder date and performs no durable write", async () => {
    const h = harness();
    await h.store.beginVerifiedLogin(OWNER);
    await expect(
      enqueueNewOnlyPrevention(
        h.store,
        "pet-A",
        { ...dto, reminderOnDate: "2026-02-30" },
        h.makeId,
      ),
    ).rejects.toThrow();
    expect(h.writes).toHaveLength(0);
    h.assertOld();
  });
  it("rejects failed native durable persist instead of falsely signaling success", async () => {
    const h = harness();
    await h.store.beginVerifiedLogin(OWNER);
    h.values.set("gafus-prevention-v2:" + OWNER + ":" + E1, "{bad-json");
    await expect(enqueueNewOnlyPrevention(h.store, "pet-A", dto, h.makeId)).rejects.toMatchObject({
      code: "V2_QUARANTINED",
    });
    h.assertOld();
  });
  it("preserves stable new-only item and parent IDs after process restart", async () => {
    const h = harness();
    await h.store.beginVerifiedLogin(OWNER);
    await enqueueNewOnlyPrevention(h.store, "pet-A", dto, h.makeId);
    const before = h.values.get("gafus-prevention-v2:" + OWNER + ":" + E1);
    const h2 = createNewOnlyV2Queues({
      storage: { getItem: async (key) => h.values.get(key) ?? null, setItem: vi.fn() },
      secure: {
        getItemAsync: async (key) => h.secrets.get(key) ?? null,
        setItemAsync: vi.fn(),
        deleteItemAsync: vi.fn(),
      },
      makeId: () => {
        throw Error("NO_IDS_DURING_RESTART");
      },
      now: () => 1,
    });
    expect(await h2.restoreVerifiedSession(OWNER)).toBe(true);
    const [saved] = await h2.getPending("prevention");
    expect(saved.eventId).toBe(BATCH);
    expect((saved.payload.entries as { eventId: string; clientId: string }[])[0]).toMatchObject({
      eventId: ID1,
      clientId: ID2,
    });
    expect(h.values.get("gafus-prevention-v2:" + OWNER + ":" + E1)).toBe(before);
    h.assertOld();
  });

  it("rejects a real durable AsyncStorage write failure without a phantom success or legacy write", async () => {
    const h = harness();
    await h.store.beginVerifiedLogin(OWNER);
    const rawBefore = new Map(h.values);
    const binding = h.store.getVerifiedBinding()!;
    const ids = [ID1, ID2, PROBE, BATCH];
    const failing = createNewOnlyV2Queues({
      storage: {
        getItem: async (key: string) => h.values.get(key) ?? null,
        setItem: vi.fn(async () => {
          throw new Error("disk-full");
        }),
      },
      secure: {
        getItemAsync: async (key: string) => h.secrets.get(key) ?? null,
        setItemAsync: async () => {
          throw Error("MUST_NOT_SET");
        },
        deleteItemAsync: async () => {
          throw Error("MUST_NOT_DELETE");
        },
      },
      makeId: () => {
        const id = ids.shift();
        if (!id) throw Error("NO_UUID");
        return id;
      },
      now: () => 1720000000000,
    });
    expect(await failing.restoreVerifiedSession(OWNER)).toBe(true);
    await expect(
      enqueueNewOnlyPrevention(failing, "pet-A", dto, () => {
        const id = ids.shift();
        if (!id) throw Error("NO_UUID");
        return id;
      }),
    ).rejects.toThrow("disk-full");
    expect(await failing.getPending("prevention")).toEqual([]);
    expect(h.values).toEqual(rawBefore);
    expect(binding.authEpoch).toBe(E1);
    h.assertOld();
  });

  it("rejects A's in-flight writer when B switches owner before storage read completes", async () => {
    const values = new Map<string, string>(Object.entries(OLD));
    const secrets = new Map<string, string>();
    const uuids = [E1, ID1, ID2, PROBE, E2];
    let release!: () => void;
    let signal!: () => void;
    const reading = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createNewOnlyV2Queues({
      storage: {
        getItem: async (key: string) => {
          signal();
          await gate;
          return values.get(key) ?? null;
        },
        setItem: async (key: string, value: string) => {
          values.set(key, value);
        },
      },
      secure: {
        getItemAsync: async (key: string) => secrets.get(key) ?? null,
        setItemAsync: async (key: string, value: string) => {
          secrets.set(key, value);
        },
        deleteItemAsync: async (key: string) => {
          secrets.delete(key);
        },
      },
      makeId: () => {
        const id = uuids.shift();
        if (!id) throw Error("NO_UUID");
        return id;
      },
      now: () => 1720000000000,
    });
    await store.beginVerifiedLogin(OWNER);
    const action = enqueueNewOnlyPrevention(store, "pet-A", dto, () => {
      const id = uuids.shift();
      if (!id) throw Error("NO_UUID");
      return id;
    });
    await reading;
    const switching = store.beginVerifiedLogin("USER_B");
    release();
    await expect(action).rejects.toMatchObject({ code: "V2_SESSION_CHANGED" });
    await switching;
    expect(store.getVerifiedBinding()?.principalId).toBe("USER_B");
    expect(await store.getPending("prevention")).toEqual([]);
    expect(values.has("gafus-prevention-v2:" + OWNER + ":" + E1)).toBe(false);
    for (const [key, raw] of Object.entries(OLD)) expect(values.get(key)).toBe(raw);
  });
});
