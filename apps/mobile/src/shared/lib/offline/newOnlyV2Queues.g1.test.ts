import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNewOnlyV2Queues, NewOnlyV2Error } from "./newOnlyV2Queues";

const A = "USER_A";
const B = "USER_B";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "d8f37921-b880-4b04-ae14-96c2e749b029";
const E3 = "a73ed977-3952-4791-b2db-318f84bc1642";
const U1 = "8ae52e9a-580f-4ab8-9545-397973bc32f5";
const U2 = "5639c98f-7140-4846-87f7-283a40ae1906";
const U3 = "346ed6e4-bfa1-4b3b-88da-5b0f9017cae7";
const legacy = {
  "progress-sync-storage": '{"state":{"queue":[{"queueId":"LEGACY"}]}}',
  "prevention-sync-storage": '{"state":{"queue":[{"clientId":"OLD"}]}}',
  "offline-storage": "{not-json-old-but-retain}",
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  const items = new Map<string, string>(Object.entries(legacy));
  const secret = new Map<string, string>();
  const logs: {
    kind: "get" | "set" | "secure-get" | "secure-set" | "secure-delete";
    key: string;
  }[] = [];
  const ids = [E1, U1, E2, U2, E3, U3];
  const makeId = vi.fn(() => {
    const id = ids.shift();
    if (!id) throw Error("Fixture UUID pool exhausted");
    return id;
  });
  const storage = {
    getItem: vi.fn(async (key: string) => {
      logs.push({ kind: "get" as const, key });
      return items.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      logs.push({ kind: "set" as const, key });
      items.set(key, value);
    }),
  };
  const secure = {
    getItemAsync: vi.fn(async (key: string) => {
      logs.push({ kind: "secure-get" as const, key });
      return secret.get(key) ?? null;
    }),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      logs.push({ kind: "secure-set" as const, key });
      secret.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      logs.push({ kind: "secure-delete" as const, key });
      secret.delete(key);
    }),
  };
  const deps = { storage, secure, makeId, now: () => 1720000000000 };
  const makeStore = () => createNewOnlyV2Queues(deps);
  const assertLegacyUnchanged = () => {
    expect(Object.fromEntries(Object.keys(legacy).map((key) => [key, items.get(key)]))).toEqual(
      legacy,
    );
    for (const item of logs.filter((l) => l.kind === "set")) {
      expect(item.key).toMatch(/^gafus-(progress|prevention)-v2:/);
    }
    expect(
      logs.filter((l) => l.kind === "get" || l.kind === "set").map((l) => l.key),
    ).not.toContain("progress-sync-storage");
    expect(
      logs.filter((l) => l.kind === "get" || l.kind === "set").map((l) => l.key),
    ).not.toContain("prevention-sync-storage");
  };
  return { items, secret, logs, storage, secure, makeStore, assertLegacyUnchanged };
}

describe("AG3-OFF021 new-only v2 queues Phase1 real storage adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a versioned owner+epoch progress envelope and retains legacy bytes", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    const receipt = await store.enqueue("progress", "completePracticeStep", {
      courseId: "course-A",
      stepIndex: 0,
    });
    expect(receipt.eventId).toBe(U1);
    expect(receipt.ownerId).toBe(A);
    expect(receipt.authEpoch).toBe(E1);
    const raw = ctx.items.get("gafus-progress-v2:USER_A:" + E1);
    expect(JSON.parse(raw!)).toMatchObject({
      schemaVersion: 2,
      principalId: A,
      authEpoch: E1,
      entries: [{ eventId: U1, kind: "completePracticeStep", createdAt: 1720000000000 }],
    });
    expect(ctx.items.has("gafus-prevention-v2:USER_A:" + E1)).toBe(false);
    ctx.assertLegacyUnchanged();
  });

  it("rehydrates the same events only after verified SAME session A/E1, never sends", async () => {
    const ctx = setup();
    const old = ctx.makeStore();
    await old.beginVerifiedLogin(A);
    await old.enqueue("progress", "startStep", { courseId: "A" });
    const next = ctx.makeStore();
    expect(await next.getPending("progress")).toEqual([]);
    expect(await next.restoreVerifiedSession(A)).toBe(true);
    expect((await next.getPending("progress"))[0]?.eventId).toBe(U1);
    const raw = ctx.items.get("gafus-progress-v2:USER_A:" + E1);
    expect(JSON.parse(raw!).entries).toHaveLength(1);
    ctx.assertLegacyUnchanged();
  });

  it("does not infer owner from a cached user or wrong SecureStore binding", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    expect(await store.restoreVerifiedSession(A)).toBe(false);
    await expect(store.enqueue("progress", "startStep", {})).rejects.toMatchObject({
      code: "V2_SESSION_UNVERIFIED",
    });
    await store.beginVerifiedLogin(A);
    ctx.secret.set(
      "gafus-v2-auth-binding",
      JSON.stringify({ schemaVersion: 2, principalId: B, authEpoch: E1 }),
    );
    const restart = ctx.makeStore();
    expect(await restart.restoreVerifiedSession(A)).toBe(false);
    await expect(restart.enqueue("prevention", "prevention.upsert", {})).rejects.toBeInstanceOf(
      NewOnlyV2Error,
    );
    ctx.assertLegacyUnchanged();
  });

  it("separates A and B, and does not adopt A/E1 when A signs in again as E3", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    await store.enqueue("progress", "pauseStep", { owner: "A" });
    const aRaw = ctx.items.get("gafus-progress-v2:USER_A:" + E1);
    await store.beginVerifiedLogin(B);
    expect(await store.getPending("progress")).toEqual([]);
    await store.enqueue("progress", "startStep", { owner: "B" });
    expect((await store.getPending("progress"))[0]?.eventId).toBe(U2);
    expect(ctx.items.get("gafus-progress-v2:USER_A:" + E1)).toBe(aRaw);
    await store.beginVerifiedLogin(A);
    expect(await store.getPending("progress")).toEqual([]);
    await store.enqueue("prevention", "prevention.upsert", {
      petId: "PET_A",
      clientId: "CLIENT_A",
    });
    expect(ctx.items.has("gafus-prevention-v2:USER_A:" + E3)).toBe(true);
    expect(ctx.items.get("gafus-progress-v2:USER_A:" + E1)).toBe(aRaw);
    ctx.assertLegacyUnchanged();
  });

  it("keeps the same authEpoch over ordinary same-session refresh", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    expect(await store.revalidateSameSession(A)).toBe(true);
    const restart = ctx.makeStore();
    expect(await restart.restoreVerifiedSession(A)).toBe(true);
    expect(restart.getVerifiedBinding()).toMatchObject({ principalId: A, authEpoch: E1 });
    ctx.assertLegacyUnchanged();
  });

  it("rejects failed durable write, does not publish phantom entry", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    ctx.storage.setItem.mockRejectedValueOnce(new Error("disk-full"));
    await expect(store.enqueue("progress", "startStep", {})).rejects.toThrow("disk-full");
    expect(await store.getPending("progress")).toEqual([]);
    ctx.assertLegacyUnchanged();
  });

  it("quarantines malformed and forged v2 envelopes without rewriting", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    const key = "gafus-progress-v2:USER_A:" + E1;
    for (const raw of [
      "{bad json",
      '{"schemaVersion":999}',
      JSON.stringify({ schemaVersion: 2, principalId: B, authEpoch: E1, entries: [] }),
    ]) {
      ctx.items.set(key, raw);
      await expect(store.getPending("progress")).rejects.toMatchObject({ code: "V2_QUARANTINED" });
      await expect(store.enqueue("progress", "startStep", {})).rejects.toMatchObject({
        code: "V2_QUARANTINED",
      });
      expect(ctx.items.get(key)).toBe(raw);
    }
    ctx.assertLegacyUnchanged();
  });

  it("fences in-flight A durable read before switch to B", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    const pending = deferred();
    const originalRead = ctx.storage.getItem.getMockImplementation()!;
    ctx.storage.getItem.mockImplementationOnce(async (key: string) => {
      await pending.promise;
      return originalRead(key);
    });
    const appending = store.enqueue("progress", "startStep", { courseId: "A" });
    await Promise.resolve();
    const switching = store.beginVerifiedLogin(B);
    pending.resolve();
    await expect(appending).rejects.toMatchObject({ code: "V2_SESSION_CHANGED" });
    await switching;
    expect(await store.getPending("progress")).toEqual([]);
    expect(ctx.items.has("gafus-progress-v2:USER_B:" + E2)).toBe(false);
    ctx.assertLegacyUnchanged();
  });

  it("logout retains every v2 and legacy entry, old epoch cannot be restored", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    await store.enqueue("prevention", "prevention.upsert", {
      petId: "P1",
      clientId: "C1",
      date: "2026-10-17",
    });
    const key = "gafus-prevention-v2:USER_A:" + E1;
    const before = ctx.items.get(key);
    await store.endSession();
    expect(store.getVerifiedBinding()).toBeNull();
    expect(await ctx.makeStore().restoreVerifiedSession(A)).toBe(false);
    expect(ctx.items.get(key)).toBe(before);
    ctx.assertLegacyUnchanged();
  });

  it("locks private pending reads immediately if SecureStore binding is replaced after login", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    await store.enqueue("progress", "startStep", { courseId: "A" });
    const oldKey = "gafus-progress-v2:USER_A:" + E1;
    const raw = ctx.items.get(oldKey);
    ctx.secret.set(
      "gafus-v2-auth-binding",
      JSON.stringify({ schemaVersion: 2, principalId: B, authEpoch: E1 }),
    );
    expect(await store.getPending("progress")).toEqual([]);
    expect(store.getVerifiedBinding()).toBeNull();
    expect(ctx.items.get(oldKey)).toBe(raw);
    ctx.assertLegacyUnchanged();
  });

  it("fences delayed native v2 read when another session changes SecureStore binding mid-read", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    await store.enqueue("progress", "startStep", { courseId: "A" });
    const aKey = "gafus-progress-v2:USER_A:" + E1;
    const previous = ctx.items.get(aKey);
    let signal!: () => void;
    const entered = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const gate = deferred();
    const originalGet = ctx.storage.getItem.getMockImplementation()!;
    ctx.storage.getItem.mockImplementationOnce(async (key: string) => {
      signal();
      await gate.promise;
      return originalGet(key);
    });
    const delayed = store.getPending("progress");
    await entered;
    ctx.secret.set(
      "gafus-v2-auth-binding",
      JSON.stringify({
        schemaVersion: 2,
        principalId: B,
        authEpoch: E2,
      }),
    );
    gate.resolve();
    expect(await delayed).toEqual([]);
    expect(store.getVerifiedBinding()).toBeNull();
    expect(ctx.items.get(aKey)).toBe(previous);
    ctx.assertLegacyUnchanged();
  });

  it("never accepts a mutation that tries to embed a credential or forbidden secret in payload", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    await expect(
      store.enqueue("progress", "startStep", { accessToken: "secret" }),
    ).rejects.toMatchObject({ code: "V2_INVALID_PAYLOAD" });
    await expect(
      store.enqueue("progress", "startStep", { nested: { refresh_token: "secret" } }),
    ).rejects.toMatchObject({ code: "V2_INVALID_PAYLOAD" });
    ctx.assertLegacyUnchanged();
  });

  it("preserves progress event ordering and stable IDs across process restart", async () => {
    const ctx = setup();
    const store = ctx.makeStore();
    await store.beginVerifiedLogin(A);
    const a = await store.enqueue("progress", "completePracticeStep", { step: 2 });
    const b = await store.enqueue("progress", "resetStep", { step: 2 });
    expect([a.eventId, b.eventId]).toEqual([U1, E2]);
    const restarted = ctx.makeStore();
    expect(await restarted.restoreVerifiedSession(A)).toBe(true);
    expect((await restarted.getPending("progress")).map((e) => e.eventId)).toEqual([U1, E2]);
    ctx.assertLegacyUnchanged();
  });
});
