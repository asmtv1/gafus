import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { createReminderV49AG4Review, type V49AG4Record } from "./reminderV49AG4Compat.review";
import {
  disabledAsyncStorageReminderCAS,
  prepareReminderV49FileCASReview,
  V49_REVIEW_SLOT,
  type FileStorage,
  type FileCASImage,
} from "./reminderV49NativeFileCAS.review";
import type { ImmutableReminderV2Post } from "./reminderV2Candidate";
const KEY = "4bc11bb9-a9a7-499a-8aa2-86fbeabfa47d";
const HMAC = "h_" + "a".repeat(64);
const B_HMAC = "h_" + "b".repeat(64);
const actor = (ownerId = "A", authEpoch = "E1") => ({ ownerId, authEpoch });
const draft = () => ({
  name: "  Личная прогулка ",
  reminderTime: "09:00",
  reminderDays: "3,1",
  timezone: "Europe/Moscow",
});
const row = () => ({
  id: "R1",
  name: "Личная прогулка",
  reminderTime: "09:00",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
  enabled: true,
});
const intent = (phase: V49AG4Record["phase"] = "MAY_HAVE_SENT"): V49AG4Record => ({
  schemaVersion: 2,
  ownerScopeHandle: HMAC,
  authEpoch: "E1",
  idempotencyKey: KEY,
  phase,
  createdAt: 1000,
  lastSeenAt: 1000,
});
const wait = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
function fakeFile() {
  let image: FileCASImage | null = null,
    serial = 0,
    fresh = true,
    readFault = false,
    casFault = false,
    attestOk = true,
    readbackFault = false,
    casInterrupted = false,
    casFailOnNumber = 0,
    casAttempt = 0,
    casBarrier: Promise<{ committed: false }> | null = null;
  const proofFlags = {
    durableCommit: true,
    revisionsNeverReused: true,
    rollbackAndLossDetection: true,
  };
  const calls: string[] = [];
  const store: FileStorage = {
    attest: vi.fn(async () => ({
      interprocessAtomicCAS: attestOk,
      ...proofFlags,
    })),
    verifiedFreshEmptyEnrollment: vi.fn(async () => fresh),
    read: vi.fn(async (slot) => {
      expect(slot).toBe(V49_REVIEW_SLOT);
      calls.push("read");
      if (readFault || (readbackFault && calls.some((x) => x === "cas")))
        throw Error("PRIVATE_READ_FAULT");
      return image ? { ...image } : null;
    }),
    compareExchange: vi.fn(async (slot, expected, next) => {
      expect(slot).toBe(V49_REVIEW_SLOT);
      calls.push("cas");
      casAttempt++;
      if (casAttempt === casFailOnNumber || casFault) throw Error("PRIVATE_CAS_FAULT");
      if (casBarrier) return casBarrier;
      if ((image?.revision ?? null) !== expected) return { committed: false as const };
      image = { revision: `rev_${++serial}`, bytes: next };
      fresh = false;
      if (casInterrupted) throw Error("ACK_LOST_AFTER_DURABLE_COMMIT");
      return { committed: true as const, revision: image.revision };
    }),
  };
  return {
    store,
    calls,
    get: () => image,
    lose: () => {
      image = null;
      fresh = false;
    },
    put: (bytes: string) => {
      image = { revision: `rev_${++serial}`, bytes };
      fresh = false;
    },
    forceWrite: (bytes: string) => {
      image = { revision: `rev_${++serial}`, bytes };
    },
    readFault: (v: boolean) => {
      readFault = v;
    },
    casFault: (v: boolean) => {
      casFault = v;
    },
    attestOk: (v: boolean) => {
      attestOk = v;
    },
    disableProof: (
      which:
        | "interprocessAtomicCAS"
        | "durableCommit"
        | "revisionsNeverReused"
        | "rollbackAndLossDetection",
    ) => {
      if (which === "interprocessAtomicCAS") attestOk = false;
      else proofFlags[which] = false;
    },
    readbackFault: (v: boolean) => {
      readbackFault = v;
    },
    casInterrupted: (v: boolean) => {
      casInterrupted = v;
    },
    failCASOn: (n: number) => {
      casFailOnNumber = n;
    },
    holdCAS: (promise: Promise<{ committed: false }>) => {
      casBarrier = promise;
    },
  };
}
let disk: ReturnType<typeof fakeFile>, binding: { principalId: string; authEpoch: string } | null;
let post: ReturnType<
  typeof vi.fn<
    (
      request: ImmutableReminderV2Post,
    ) => Promise<{ success: boolean; data?: ReturnType<typeof row> }>
  >
>;
let uuidCall: ReturnType<typeof vi.fn<() => string>>;
let secretDerive: ReturnType<typeof vi.fn<(owner: string) => Promise<string>>>;
const deps = () => ({
  file: disk.store,
  getVerifiedBinding: () => binding,
  deriveProtectedHmacOwnerScope: secretDerive,
});
async function open(a = actor()) {
  const prepared = await prepareReminderV49FileCASReview(a, deps());
  expect(prepared.state).toBe("ready");
  if (prepared.state !== "ready") throw Error("NOT_PREPARED");
  const gate = createReminderV49AG4Review({
    store: prepared.store,
    scopeHandle: prepared.scopeHandle,
    clock: () => 1000,
    uuidV4: uuidCall,
    postMock: (req) => post(req),
  });
  return { gate, prepared };
}
beforeEach(() => {
  vi.clearAllMocks();
  disk = fakeFile();
  binding = { principalId: "A", authEpoch: "E1" };
  post = vi
    .fn<
      (
        request: ImmutableReminderV2Post,
      ) => Promise<{ success: boolean; data?: ReturnType<typeof row> }>
    >()
    .mockResolvedValue({ success: true, data: row() });
  uuidCall = vi.fn<() => string>(() => KEY);
  secretDerive = vi.fn(async (owner) => (owner === "A" ? HMAC : B_HMAC));
});
describe("AG3 V49 FileStorage/AsyncStorage CAS capability source/mock ONLY", () => {
  it("PREPARED reserve + verified MAY_HAVE_SENT CAS before mock POST; only seven-field pseudonym JSON", async () => {
    const { gate } = await open();
    expect(await gate.restore(actor(), () => true)).toBe("idle");
    post.mockImplementationOnce(async (request) => {
      const image = disk.get();
      expect(image).not.toBeNull();
      expect(JSON.parse(image!.bytes)).toEqual(intent());
      expect(request.headers["Idempotency-Key"]).toBe(KEY);
      expect(image!.bytes).not.toMatch(
        /Личная прогулка|ownerId|reminderTime|timeZone|JWT|token|payload/,
      );
      return { success: true, data: row() };
    });
    expect((await gate.create(actor(), draft(), () => true)).kind).toBe("acknowledged");
    // V49 consumer itself verifies each phase with an additional load() roundtrip.
    expect(disk.calls).toEqual(["read", "cas", "read", "read", "cas", "read", "read"]);
    expect(post).toHaveBeenCalledOnce();
    expect(uuidCall).toHaveBeenCalledOnce();
    expect(secretDerive).toHaveBeenCalledExactlyOnceWith("A");
  });
  it("two independent factories sharing one atomic file have ONE winning reservation and POST", async () => {
    const x = await open(),
      y = await open();
    expect(await x.gate.restore(actor(), () => true)).toBe("idle");
    expect(await y.gate.restore(actor(), () => true)).toBe("idle");
    const results = await Promise.all([
      x.gate.create(actor(), draft(), () => true),
      y.gate.create(actor(), draft(), () => true),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["acknowledged", "blocked"]);
    expect(post).toHaveBeenCalledOnce();
    expect(disk.store.compareExchange).toHaveBeenCalledTimes(3);
  });
  it("read-before-reserve required: direct store.reserve without restore denies POST", async () => {
    const { prepared } = await open();
    expect(await prepared.store.reserve({ ...intent("PREPARED") })).toBe(false);
    expect(disk.store.compareExchange).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("cross-process ABA fenced by monotonically new file revision (not byte equality)", async () => {
    const x = await open(),
      y = await open();
    expect(await x.prepared.store.load()).toBeNull();
    expect(await x.prepared.store.reserve(intent("PREPARED"))).toBe(true);
    expect(((await y.prepared.store.load()) as V49AG4Record).phase).toBe("PREPARED");
    const oldBytes = disk.get()!.bytes;
    disk.forceWrite(JSON.stringify(intent("UNKNOWN")));
    disk.forceWrite(oldBytes);
    expect(await y.prepared.store.cas(intent("PREPARED"), intent("MAY_HAVE_SENT"))).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
  it("interrupted commit after disk CAS but before ACK: no POST, restart sees UNKNOWN", async () => {
    disk.casInterrupted(true);
    const first = await open();
    await first.gate.restore(actor(), () => true);
    expect(await first.gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect(disk.get()).not.toBeNull();
    disk.casInterrupted(false);
    const after = await open();
    expect(await after.gate.restore(actor(), () => true)).toBe("unknown");
    expect(await after.gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
  it("durable PREPARED survives aborted second CAS; restart UNKNOWN with original UUID", async () => {
    const first = await open();
    await first.gate.restore(actor(), () => true);
    disk.failCASOn(2);
    expect(await first.gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(JSON.parse(disk.get()!.bytes).phase).toBe("PREPARED");
    const after = await open();
    expect(await after.gate.restore(actor(), () => true)).toBe("unknown");
    expect(post).not.toHaveBeenCalled();
  });
  it("readback fault after CAS prevents POST, next launch retains MAY_HAVE_SENT", async () => {
    const first = await open();
    await first.gate.restore(actor(), () => true);
    disk.readbackFault(true);
    expect(await first.gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    disk.readbackFault(false);
    const after = await open();
    expect(await after.gate.restore(actor(), () => true)).toBe("unknown");
  });
  it("real AsyncStorage-style getItem/setItem are never CAS, disabled adapter blocks with zero writes", async () => {
    const getItem = vi.fn(async () => null),
      setItem = vi.fn(async (_key: string, _value: string) => undefined);
    const store = disabledAsyncStorageReminderCAS({ getItem, setItem });
    const gate = createReminderV49AG4Review({
      store,
      scopeHandle: () => HMAC,
      clock: () => 1000,
      uuidV4: uuidCall,
      postMock: (req) => post(req),
    });
    expect(await gate.restore(actor(), () => true)).toBe("blocked");
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(uuidCall).not.toHaveBeenCalled();
  });
  it("unattested/non-durable/interprocess CAS backend does not return a writable adapter", async () => {
    disk.attestOk(false);
    expect(await prepareReminderV49FileCASReview(actor(), deps())).toEqual({
      state: "unavailable",
    });
    expect(disk.store.read).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("unverified actor, rotated epoch, wrong HMAC, untrusted owner cannot write or read", async () => {
    binding = null;
    expect(await prepareReminderV49FileCASReview(actor(), deps())).toEqual({
      state: "unavailable",
    });
    binding = { principalId: "A", authEpoch: "E1" };
    secretDerive.mockResolvedValueOnce("A");
    expect(await prepareReminderV49FileCASReview(actor(), deps())).toEqual({
      state: "unavailable",
    });
    const { gate } = await open();
    expect(await gate.restore(actor(), () => true)).toBe("idle");
    binding = { principalId: "A", authEpoch: "E2" };
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(disk.store.compareExchange).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("interrupted async disk I/O while A→B→A/E2: no POST; old intent quarantined", async () => {
    const hold = wait<{ committed: false }>();
    disk.holdCAS(hold.promise);
    const { gate } = await open();
    await gate.restore(actor(), () => true);
    const pending = gate.create(actor(), draft(), () => true);
    await vi.waitFor(() => expect(disk.store.compareExchange).toHaveBeenCalledOnce());
    binding = { principalId: "B", authEpoch: "B1" };
    binding = { principalId: "A", authEpoch: "E2" };
    // Commit MAY have occurred, but ACK is lost and must never unlock a POST.
    hold.resolve({ committed: false });
    expect(await pending).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
  it("missing file after known enrollment must never be interpreted as fresh empty", async () => {
    const first = await open();
    await first.gate.restore(actor(), () => true);
    await first.gate.create(actor(), draft(), () => true);
    disk.lose();
    const newApp = await open();
    expect(await newApp.gate.restore(actor(), () => true)).toBe("blocked");
    expect(await newApp.gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).toHaveBeenCalledOnce();
  });
  it("all four independent attestation requirements are mandatory, no implicit fallback", async () => {
    const flags = [
      "interprocessAtomicCAS",
      "durableCommit",
      "revisionsNeverReused",
      "rollbackAndLossDetection",
    ] as const;
    for (const missing of flags) {
      disk = fakeFile();
      disk.disableProof(missing);
      expect(await prepareReminderV49FileCASReview(actor(), deps())).toEqual({
        state: "unavailable",
      });
      expect(disk.store.read).not.toHaveBeenCalled();
    }
    expect(post).not.toHaveBeenCalled();
  });
  it("protected HMAC provider failure or epoch flip while deriving refuses storage", async () => {
    secretDerive.mockRejectedValueOnce(new Error("PRIVATE_PROTECTED_SECRET"));
    expect(await prepareReminderV49FileCASReview(actor(), deps())).toEqual({
      state: "unavailable",
    });
    expect(disk.store.read).not.toHaveBeenCalled();
    let finish!: (value: string) => void;
    secretDerive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = prepareReminderV49FileCASReview(actor(), deps());
    await vi.waitFor(() => expect(secretDerive).toHaveBeenCalledTimes(2));
    binding = { principalId: "A", authEpoch: "E2" };
    finish(HMAC);
    expect(await pending).toEqual({ state: "unavailable" });
    expect(post).not.toHaveBeenCalled();
  });
  it("provider says CAS committed but disk has no new revision/bytes: readback blocks POST", async () => {
    const { gate } = await open();
    await gate.restore(actor(), () => true);
    vi.spyOn(disk.store, "compareExchange").mockResolvedValueOnce({
      committed: true,
      revision: "ghost_rev",
    });
    expect(await gate.create(actor(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect(disk.get()).toBeNull();
  });
  it("current A journal never rewritten as B when owner changes but epoch is coincidentally equal", async () => {
    const initial = await open();
    await initial.gate.restore(actor(), () => true);
    post.mockRejectedValueOnce(new Error("ACK_LOST_AFTER_COMMIT"));
    expect((await initial.gate.create(actor(), draft(), () => true)).kind).toBe("unknown");
    const saved = disk.get()?.bytes;
    binding = { principalId: "B", authEpoch: "E1" };
    const second = await open(actor("B", "E1"));
    expect(await second.gate.restore(actor("B", "E1"), () => true)).toBe("quarantined");
    expect(await second.gate.create(actor("B", "E1"), draft(), () => true)).toEqual({
      kind: "blocked",
    });
    expect(disk.get()?.bytes).toBe(saved);
    expect(post).toHaveBeenCalledOnce();
  });
  it("malformed v1/raw-owner journal remains blocked without migration or fallback", async () => {
    disk.put(JSON.stringify({ ...intent(), schemaVersion: 1, ownerId: "A" }));
    const newApp = await open();
    expect(await newApp.gate.restore(actor(), () => true)).toBe("blocked");
    expect(post).not.toHaveBeenCalled();
  });
});
