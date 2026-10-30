/**
 * AG3-OFF021 Phase1 dual-queue model tests. One native-like storage authority,
 * one verified owner/authEpoch, deterministic restart and lost-response states.
 * NO HTTP, replay, ACK dequeue, historical queue rewrites, or migration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2QueueKind,
  type V2PendingEvent,
  type V2SessionBinding,
} from "./newOnlyV2Queues";
import {
  evaluatePracticeJournalResponse,
  preparePracticeJournalRequest,
} from "./newOnlyV2PracticeContract";
import {
  evaluatePreventionJournalContract,
  preparePreventionJournalContract,
} from "./newOnlyV2PreventionContract";

const A = "USER_A";
const B = "USER_B";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "d8f37921-b880-4b04-ae14-96c2e749b029";
const E3 = "a73ed977-3952-4791-b2db-318f84bc1642";
const P_ID = "8ae52e9a-580f-4ab8-9545-397973bc32f5";
const B_ID = "5639c98f-7140-4846-87f7-283a40ae1906";
const I1 = "23a47d4c-9b22-4f0b-a0e6-06d634e7a701";
const I2 = "23a47d4c-9b22-4f0b-a0e6-06d634e7a702";
const C1 = "71243d0c-a88f-4999-b74e-0c72f38782f1";
const C2 = "71243d0c-a88f-4999-b74e-0c72f38782f2";
const CID = "clg0v5dte000008mf2dkq239x";
const DID = "clg0v5dte000108mf8bgq229x";
const PET = "synthetic-petA";
const PRACTICE_PAYLOAD = { courseId: CID, dayOnCourseId: DID, stepIndex: 1 };
const PREVENTION_PAYLOAD = {
  petId: PET,
  entries: [
    {
      eventId: I1,
      clientId: C1,
      type: "VACCINATION",
      performedAt: "2026-10-16T12:00:00.000Z",
      reminderEnabled: false,
    },
    {
      eventId: I2,
      clientId: C2,
      type: "DEWORMING",
      performedAt: "2026-10-16T12:00:00.000Z",
      reminderEnabled: false,
    },
  ],
};
const OLD_BYTES = {
  "progress-sync-storage": '{"state":{"queue":[{"queueId":"UNKNOWN"}]}}',
  "prevention-sync-storage": '{"state":{"queue":[{"clientId":"UNKNOWN"}]}}',
  "offline-storage": "non-json-legacy-native-media",
  "video-progress-storage": '{"legacy":true}',
};

type Operation = "practice" | "prevention";
type MachineStep =
  | "cold"
  | "verified_A_E1"
  | "durable_both"
  | "restart_unverified"
  | "restored_A_E1"
  | "lost_both_post"
  | "get_not_found"
  | "get_partial_ack"
  | "get_committed_ack"
  | "logout"
  | "verified_B_E2"
  | "verified_A_E3";
function makeHarness() {
  const kv = new Map<string, string>(Object.entries(OLD_BYTES));
  const secrets = new Map<string, string>();
  const calls: {
    verb: "get" | "set" | "secure-get" | "secure-set" | "secure-delete";
    key: string;
  }[] = [];
  const ids = [E1, P_ID, B_ID, E2, E3];
  const deps = {
    storage: {
      getItem: async (key: string) => {
        calls.push({ verb: "get" as const, key });
        return kv.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        calls.push({ verb: "set" as const, key });
        kv.set(key, value);
      },
    },
    secure: {
      getItemAsync: async (key: string) => {
        calls.push({ verb: "secure-get" as const, key });
        return secrets.get(key) ?? null;
      },
      setItemAsync: async (key: string, value: string) => {
        calls.push({ verb: "secure-set" as const, key });
        secrets.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        calls.push({ verb: "secure-delete" as const, key });
        secrets.delete(key);
      },
    },
    makeId: () => {
      const id = ids.shift();
      if (!id) throw Error("EXHAUSTED_UUID_FIXTURE");
      return id;
    },
    now: () => 1720000000000,
  };
  return {
    kv,
    secrets,
    calls,
    create: () => createNewOnlyV2Queues(deps),
    key: (type: NewOnlyV2QueueKind, owner = A, epoch = E1) => `gafus-${type}-v2:${owner}:${epoch}`,
    assertLegacyUntouched() {
      for (const [key, raw] of Object.entries(OLD_BYTES)) expect(kv.get(key)).toBe(raw);
      expect(calls.filter(({ key }) => key in OLD_BYTES)).toEqual([]);
      expect(calls.filter(({ verb, key }) => verb === "set" && !key.startsWith("gafus-"))).toEqual(
        [],
      );
    },
  };
}
function practiceAck(event: V2PendingEvent, replayed: boolean) {
  return {
    success: true,
    ack: {
      protocol: 2,
      eventId: event.eventId,
      state: "COMMITTED",
      replayed,
      operation: "training.complete.practice",
      serverRevision: "7",
      result: { courseId: CID, allCompleted: false, stepJustCompleted: true },
    },
  };
}
function preventionAck(event: V2PendingEvent, replayed: boolean) {
  return {
    success: true,
    ack: {
      protocol: 2,
      eventId: event.eventId,
      state: "COMMITTED",
      replayed,
      operation: "prevention.batch",
      serverRevision: "1",
      items: [
        { eventId: I1, clientId: C1, state: "COMMITTED", result: "CREATED", serverRowId: "row1" },
        { eventId: I2, clientId: C2, state: "COMMITTED", result: "CREATED", serverRowId: "row2" },
      ],
    },
  };
}
function pendingIds(events: V2PendingEvent[]): string[] {
  return events.map((event) => event.eventId);
}
function binding(owner: string, authEpoch: string): V2SessionBinding {
  return { schemaVersion: 2, principalId: owner, authEpoch };
}

afterEach(() => vi.unstubAllGlobals());

describe("AG3 OFF021 combined practice+prevention Phase1 restart/lost-response state machine", () => {
  it.each([
    ["practice", "prevention"],
    ["prevention", "practice"],
  ] as const)(
    "follows deterministic dual-queue state graph: enqueue %s before %s",
    async (first, second) => {
      const env = makeHarness();
      // A hard network tripwire: nothing in this Phase1 model may reach HTTP.
      const fetchTripwire = vi.fn(async () => {
        throw Error("FORBIDDEN_PHASE2_NETWORK");
      });
      vi.stubGlobal("fetch", fetchTripwire);
      const trace: MachineStep[] = ["cold"];
      let storage = env.create();
      expect(storage.getVerifiedBinding()).toBeNull();
      expect(await storage.getPending("progress")).toEqual([]);
      expect(await storage.getPending("prevention")).toEqual([]);
      expect(env.kv.size).toBe(Object.keys(OLD_BYTES).length);

      expect(await storage.beginVerifiedLogin(A)).toEqual(binding(A, E1));
      trace.push("verified_A_E1");
      const order: readonly Operation[] = [first, second];
      const initial = new Map<Operation, V2PendingEvent>();
      for (const op of order) {
        const written =
          op === "practice"
            ? await storage.enqueue("progress", "completePracticeStep", PRACTICE_PAYLOAD)
            : await storage.enqueue("prevention", "prevention.upsert", PREVENTION_PAYLOAD);
        expect(written.ownerId).toBe(A);
        expect(written.authEpoch).toBe(E1);
        initial.set(op, written);
      }
      const practice = initial.get("practice")!;
      const prevention = initial.get("prevention")!;
      expect(new Set([practice.eventId, prevention.eventId])).toEqual(new Set([P_ID, B_ID]));
      const rawPractice = env.kv.get(env.key("progress"));
      const rawPrevention = env.kv.get(env.key("prevention"));
      expect(rawPractice).toContain(practice.eventId);
      expect(rawPrevention).toContain(prevention.eventId);
      expect(env.kv.size).toBe(Object.keys(OLD_BYTES).length + 2);
      trace.push("durable_both");
      env.assertLegacyUntouched();

      // A killed app instance has no cached principal: no unverified visibility.
      storage = env.create();
      expect(storage.getVerifiedBinding()).toBeNull();
      expect(await storage.getPending("progress")).toEqual([]);
      expect(await storage.getPending("prevention")).toEqual([]);
      trace.push("restart_unverified");
      expect(await storage.restoreVerifiedSession(A)).toBe(true);
      expect(storage.getVerifiedBinding()).toEqual(binding(A, E1));
      trace.push("restored_A_E1");
      const [readPractice] = await storage.getPending("progress");
      const [readPrevention] = await storage.getPending("prevention");
      expect(pendingIds([readPractice])).toEqual([practice.eventId]);
      expect(pendingIds([readPrevention])).toEqual([prevention.eventId]);
      const verified = storage.getVerifiedBinding()!;
      const previewPractice = preparePracticeJournalRequest(
        { binding: verified, event: readPractice },
        verified,
      );
      const previewPrevention = preparePreventionJournalContract(
        { binding: verified, event: readPrevention },
        verified,
      );
      expect(previewPractice.post.headers["Idempotency-Key"]).toBe(practice.eventId);
      expect(previewPrevention.post.headers["Idempotency-Key"]).toBe(prevention.eventId);
      expect(previewPractice.lookup.path.split("/").at(-1)).toBe(practice.eventId);
      expect(previewPrevention.lookup.path.split("/").at(-1)).toBe(prevention.eventId);
      expect(
        new Set([previewPractice.post.body.eventId, previewPrevention.post.body.eventId]).size,
      ).toBe(2);
      expect(JSON.stringify([previewPractice.post, previewPrevention.post])).not.toContain(E1);
      expect(JSON.stringify([previewPractice.post, previewPrevention.post])).not.toContain(A);

      // Both POSTs have ambiguous outcome; never turn a lost response into an ACK.
      const practiceUnknown = evaluatePracticeJournalResponse(
        previewPractice,
        verified,
        readPractice,
        "post",
        null,
        null,
      );
      const preventionUnknown = evaluatePreventionJournalContract(
        previewPrevention,
        verified,
        readPrevention,
        "post",
        null,
        null,
      );
      expect(practiceUnknown.status).toBe("pending");
      expect(preventionUnknown.status).toBe("pending");
      trace.push("lost_both_post");
      expect(
        evaluatePracticeJournalResponse(previewPractice, verified, readPractice, "lookup", 404, {
          success: false,
          code: "NOT_FOUND",
        }).status,
      ).toBe("pending");
      expect(
        evaluatePreventionJournalContract(
          previewPrevention,
          verified,
          readPrevention,
          "lookup",
          404,
          { success: false, code: "NOT_FOUND" },
        ).status,
      ).toBe("pending");
      trace.push("get_not_found");

      // Partial or cross-operation receipts remain pending, even if HTTP status is 200.
      const incomplete = preventionAck(readPrevention, true);
      expect(
        evaluatePreventionJournalContract(
          previewPrevention,
          verified,
          readPrevention,
          "lookup",
          200,
          {
            ...incomplete,
            ack: { ...incomplete.ack, items: incomplete.ack.items.slice(0, 1) },
          },
        ).status,
      ).toBe("pending");
      expect(
        evaluatePracticeJournalResponse(
          previewPractice,
          verified,
          readPractice,
          "lookup",
          200,
          preventionAck(readPrevention, true),
        ).status,
      ).toBe("pending");
      expect(
        evaluatePreventionJournalContract(
          previewPrevention,
          verified,
          readPrevention,
          "lookup",
          200,
          practiceAck(readPractice, true),
        ).status,
      ).toBe("pending");
      trace.push("get_partial_ack");

      // Pure descriptions + mock lookup receipts can correlate, but NEVER dequeue.
      expect(
        evaluatePracticeJournalResponse(
          previewPractice,
          verified,
          readPractice,
          "lookup",
          200,
          practiceAck(readPractice, true),
        ),
      ).toEqual({ status: "confirmed", eventId: practice.eventId, replayed: true });
      expect(
        evaluatePreventionJournalContract(
          previewPrevention,
          verified,
          readPrevention,
          "lookup",
          200,
          preventionAck(readPrevention, true),
        ),
      ).toEqual({ status: "confirmed", eventId: prevention.eventId, replayed: true });
      trace.push("get_committed_ack");
      expect(pendingIds(await storage.getPending("progress"))).toEqual([practice.eventId]);
      expect(pendingIds(await storage.getPending("prevention"))).toEqual([prevention.eventId]);
      expect(env.kv.get(env.key("progress"))).toBe(rawPractice);
      expect(env.kv.get(env.key("prevention"))).toBe(rawPrevention);

      await storage.endSession();
      expect(storage.getVerifiedBinding()).toBeNull();
      expect(await storage.getPending("progress")).toEqual([]);
      expect(await storage.getPending("prevention")).toEqual([]);
      trace.push("logout");
      expect(await storage.beginVerifiedLogin(B)).toEqual(binding(B, E2));
      trace.push("verified_B_E2");
      expect(await storage.getPending("progress")).toEqual([]);
      expect(await storage.getPending("prevention")).toEqual([]);
      expect(
        evaluatePracticeJournalResponse(
          previewPractice,
          storage.getVerifiedBinding(),
          readPractice,
          "lookup",
          200,
          practiceAck(readPractice, true),
        ).status,
      ).toBe("pending");
      expect(
        evaluatePreventionJournalContract(
          previewPrevention,
          storage.getVerifiedBinding(),
          readPrevention,
          "lookup",
          200,
          preventionAck(readPrevention, true),
        ).status,
      ).toBe("pending");
      await storage.endSession();
      expect(await storage.beginVerifiedLogin(A)).toEqual(binding(A, E3));
      trace.push("verified_A_E3");
      expect(await storage.getPending("progress")).toEqual([]);
      expect(await storage.getPending("prevention")).toEqual([]);
      expect(env.kv.get(env.key("progress"))).toBe(rawPractice);
      expect(env.kv.get(env.key("prevention"))).toBe(rawPrevention);
      env.assertLegacyUntouched();
      expect(fetchTripwire).not.toHaveBeenCalled();
      expect(trace).toEqual([
        "cold",
        "verified_A_E1",
        "durable_both",
        "restart_unverified",
        "restored_A_E1",
        "lost_both_post",
        "get_not_found",
        "get_partial_ack",
        "get_committed_ack",
        "logout",
        "verified_B_E2",
        "verified_A_E3",
      ]);
    },
  );

  it("fails closed for both queue views if SecureStore changes externally across a single restart", async () => {
    const env = makeHarness();
    const first = env.create();
    await first.beginVerifiedLogin(A);
    const practice = await first.enqueue("progress", "completePracticeStep", PRACTICE_PAYLOAD);
    const prevention = await first.enqueue("prevention", "prevention.upsert", PREVENTION_PAYLOAD);
    const practiceRaw = env.kv.get(env.key("progress"));
    const preventionRaw = env.kv.get(env.key("prevention"));
    const restarted = env.create();
    expect(await restarted.restoreVerifiedSession(A)).toBe(true);
    const oldBinding = restarted.getVerifiedBinding()!;
    const [p] = await restarted.getPending("progress");
    const [v] = await restarted.getPending("prevention");
    const pPreview = preparePracticeJournalRequest({ binding: oldBinding, event: p }, oldBinding);
    const vPreview = preparePreventionJournalContract(
      { binding: oldBinding, event: v },
      oldBinding,
    );
    env.secrets.set("gafus-v2-auth-binding", JSON.stringify(binding(A, E2)));
    expect(await restarted.getPending("progress")).toEqual([]);
    expect(restarted.getVerifiedBinding()).toBeNull();
    expect(await restarted.getPending("prevention")).toEqual([]);
    expect(
      evaluatePracticeJournalResponse(
        pPreview,
        restarted.getVerifiedBinding(),
        practice,
        "lookup",
        200,
        practiceAck(practice, true),
      ).status,
    ).toBe("pending");
    expect(
      evaluatePreventionJournalContract(
        vPreview,
        restarted.getVerifiedBinding(),
        prevention,
        "lookup",
        200,
        preventionAck(prevention, true),
      ).status,
    ).toBe("pending");
    expect(env.kv.get(env.key("progress"))).toBe(practiceRaw);
    expect(env.kv.get(env.key("prevention"))).toBe(preventionRaw);
    env.assertLegacyUntouched();
  });

  it("corrupt v2 prevention envelope is quarantined while valid practice and legacy bytes remain intact", async () => {
    const env = makeHarness();
    const store = env.create();
    await store.beginVerifiedLogin(A);
    const practice = await store.enqueue("progress", "completePracticeStep", PRACTICE_PAYLOAD);
    await store.enqueue("prevention", "prevention.upsert", PREVENTION_PAYLOAD);
    const oldProgress = env.kv.get(env.key("progress"));
    const corruptRaw = '{"schemaVersion":2,"entries":[{"bad":"payload"}]}';
    env.kv.set(env.key("prevention"), corruptRaw);
    const restarted = env.create();
    expect(await restarted.restoreVerifiedSession(A)).toBe(true);
    await expect(restarted.getPending("prevention")).rejects.toMatchObject({
      code: "V2_QUARANTINED",
    });
    expect(pendingIds(await restarted.getPending("progress"))).toEqual([practice.eventId]);
    expect(env.kv.get(env.key("prevention"))).toBe(corruptRaw);
    expect(env.kv.get(env.key("progress"))).toBe(oldProgress);
    env.assertLegacyUntouched();
  });
});
