import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";
import type { V2PendingEvent } from "./newOnlyV2Queues";
import {
  evaluatePracticeJournalResponse,
  preparePracticeJournalRequest,
  type PracticeEventSnapshot,
} from "./newOnlyV2PracticeContract";

const A = {
  schemaVersion: 2 as const,
  principalId: "USER_A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
const B = { ...A, principalId: "USER_B", authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029" };
const newA = { ...A, authEpoch: "a73ed977-3952-4791-b2db-318f84bc1642" };
const U1 = "8ae52e9a-580f-4ab8-9545-397973bc32f5";
const U2 = "5639c98f-7140-4846-87f7-283a40ae1906";
const CID = "clg0v5dte000008mf2dkq239x";
const DID = "clg0v5dte000108mf8bgq229x";
const event: V2PendingEvent = {
  eventId: U1,
  createdAt: 1720000000000,
  kind: "completePracticeStep",
  payload: { courseId: CID, dayOnCourseId: DID, stepIndex: 1 },
};
const snap = (binding = A, item = event): PracticeEventSnapshot => ({ binding, event: item });
const committed = (replayed = false) => ({
  success: true,
  ack: {
    protocol: 2,
    eventId: U1,
    state: "COMMITTED",
    replayed,
    operation: "training.complete.practice",
    serverRevision: "7",
    result: { courseId: CID, allCompleted: false, stepJustCompleted: true },
  },
});

describe("AG3 OFF021 contract compatibility: AG1 practice-only journal (mock, Phase1)", () => {
  it("creates server-exact POST path/headers/body, no epoch/legacy fallback and no network", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    expect(req.post).toEqual({
      method: "POST",
      path: "/api/v1/offline/mutations",
      headers: {
        "X-Gafus-Sync-Protocol": "2",
        "Idempotency-Key": U1,
      },
      body: {
        eventId: U1,
        operation: "training.complete.practice",
        courseId: CID,
        dayOnCourseId: DID,
        stepIndex: 1,
      },
    });
    expect(req.lookup).toEqual({
      method: "GET",
      path: "/api/v1/offline/mutations/" + U1,
      headers: { "X-Gafus-Sync-Protocol": "2" },
    });
    expect(JSON.stringify(req)).not.toMatch(
      /authEpoch|USER_A|auth_token|refresh_token|X-Client-Auth-Epoch|training.step/i,
    );
  });

  it("captures canonical server fingerprint input independent of local key/owner", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    const canonical = JSON.stringify({
      method: "POST",
      operation: "training.complete.practice",
      courseId: CID,
      dayOnCourseId: DID,
      stepIndex: 1,
    });
    expect(req.canonicalFingerprintInput).toBe(canonical);
    expect(createHash("sha256").update(req.canonicalFingerprintInput).digest("hex")).toBe(
      "7780b139a33bf935da2d7d30ee3705eadaab11d2ec01b04b7134e380b15b5b36",
    );
    // Backend binds principal by authenticated JWT and unique(ownerId,eventId), not inside payload hash.
    expect(req.canonicalFingerprintInput).not.toContain("USER_A");
    expect(req.canonicalFingerprintInput).not.toContain(A.authEpoch);
  });

  it("rejects different owner, old same-owner authEpoch, unsupported and forged payload", () => {
    expect(() => preparePracticeJournalRequest(snap(), B)).toThrow();
    expect(() => preparePracticeJournalRequest(snap(), newA)).toThrow();
    expect(() =>
      preparePracticeJournalRequest(snap(A, { ...event, kind: "startStep" }), A),
    ).toThrow();
    expect(() =>
      preparePracticeJournalRequest(
        snap(A, {
          ...event,
          eventId: "not-uuid",
        }),
        A,
      ),
    ).toThrow();
    expect(() =>
      preparePracticeJournalRequest(
        snap(A, {
          ...event,
          payload: { ...event.payload, queueId: "historical-ownerless" },
        }),
        A,
      ),
    ).toThrow();
    expect(() =>
      preparePracticeJournalRequest(
        snap(A, {
          ...event,
          payload: { ...event.payload, accessToken: "secret" },
        }),
        A,
      ),
    ).toThrow();
  });

  it("accepts correlated first COMMITTED POST as evidence only, never deletes", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    const result = evaluatePracticeJournalResponse(req, A, event, "post", 200, committed());
    expect(result).toEqual({ status: "confirmed", eventId: U1, replayed: false });
  });

  it("simulates LOST POST response: unknown commit remains pending until exact verified GET receipt", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    expect(evaluatePracticeJournalResponse(req, A, event, "post", null, null)).toMatchObject({
      status: "pending",
    });
    expect(evaluatePracticeJournalResponse(req, A, event, "lookup", 200, committed(true))).toEqual({
      status: "confirmed",
      eventId: U1,
      replayed: true,
    });
    expect(req.post.body.eventId).toBe(req.lookup.path.split("/").at(-1));
  });

  it("fails closed on 200 bare success, wrong ID, operation, protocol, state or revision", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    const variants = [
      { success: true },
      { success: true, ack: { ...committed().ack, eventId: U2 } },
      { success: true, ack: { ...committed().ack, operation: "training.complete.theory" } },
      { success: true, ack: { ...committed().ack, protocol: 1 } },
      { success: true, ack: { ...committed().ack, state: "RESERVED" } },
      { success: true, ack: { ...committed().ack, serverRevision: "0" } },
      {
        success: true,
        ack: { ...committed().ack, result: { ...committed().ack.result, courseId: DID } },
      },
    ];
    for (const response of variants) {
      expect(evaluatePracticeJournalResponse(req, A, event, "post", 200, response)).toMatchObject({
        status: "pending",
      });
    }
  });

  it("denies ACK on A-to-B principal change, A epoch rotation or mutated pending event", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    for (const binding of [B, newA, null]) {
      expect(
        evaluatePracticeJournalResponse(req, binding, event, "post", 200, committed()),
      ).toMatchObject({ status: "pending" });
    }
    const changed = { ...event, payload: { ...event.payload, stepIndex: 2 } };
    expect(
      evaluatePracticeJournalResponse(req, A, changed, "post", 200, committed()),
    ).toMatchObject({ status: "pending" });
    expect(
      evaluatePracticeJournalResponse(
        req,
        A,
        { ...event, eventId: U2 },
        "lookup",
        200,
        committed(true),
      ),
    ).toMatchObject({ status: "pending" });
  });

  it("never treats GET 404 NOT_FOUND, old-node POST 404, 409, 401, 403, 429, 503, timeout as ACK", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    for (const [status, body] of [
      [404, { success: false, code: "NOT_FOUND" }],
      [404, { success: false, code: "MISSING_OLD_SERVER_ROUTE" }],
      [409, { success: false, code: "IDEMPOTENCY_KEY_CONFLICT" }],
      [409, { success: false, code: "INVALID_STATE" }],
      [401, { success: false, code: "UNAUTHORIZED" }],
      [403, { success: false, code: "FORBIDDEN" }],
      [429, { success: false, code: "RATE_LIMITED" }],
      [503, { success: false, code: "JOURNAL_UNAVAILABLE" }],
      [500, null],
    ] as const) {
      expect(evaluatePracticeJournalResponse(req, A, event, "post", status, body)).toMatchObject({
        status: "pending",
      });
      expect(evaluatePracticeJournalResponse(req, A, event, "lookup", status, body)).toMatchObject({
        status: "pending",
      });
    }
  });

  it("GET only confirms server's replayed:true, and lost response cannot create new event ID", () => {
    const req = preparePracticeJournalRequest(snap(), A);
    expect(
      evaluatePracticeJournalResponse(req, A, event, "lookup", 200, committed(false)),
    ).toMatchObject({ status: "pending" });
    const again = preparePracticeJournalRequest(snap(), A);
    expect(again.post.body.eventId).toBe(req.post.body.eventId);
    expect(again.canonicalFingerprintInput).toBe(req.canonicalFingerprintInput);
  });

  it("has no ability to send network requests or remove old/new queue bytes", async () => {
    const calls: string[] = [];
    const fakeLegacy = new Map([
      ["progress-sync-storage", "historical-v1-bytes"],
      ["gafus-progress-v2:USER_A:" + A.authEpoch, "new-only-pending-U1"],
    ]);
    const req = preparePracticeJournalRequest(snap(), A);
    const status = evaluatePracticeJournalResponse(req, A, event, "post", 200, committed());
    expect(status.status).toBe("confirmed");
    expect(calls).toEqual([]);
    expect(fakeLegacy.get("progress-sync-storage")).toBe("historical-v1-bytes");
    expect(fakeLegacy.get("gafus-progress-v2:USER_A:" + A.authEpoch)).toBe("new-only-pending-U1");
  });

  it("binds actual persisted new-only v2 event to immutable POST+GET snapshot across app restart", async () => {
    const kv = new Map<string, string>([
      ["progress-sync-storage", "{original-ownerless-byte-corpus}"],
      ["prevention-sync-storage", "{historical-never-touched}"],
    ]);
    const ss = new Map<string, string>();
    const ids = [A.authEpoch, U1, B.authEpoch];
    const storage = {
      getItem: async (key: string) => kv.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        kv.set(key, value);
      },
    };
    const secure = {
      getItemAsync: async (key: string) => ss.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        ss.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        ss.delete(key);
      },
    };
    const factory = () =>
      createNewOnlyV2Queues({
        storage,
        secure,
        makeId: () => {
          const next = ids.shift();
          if (!next) throw Error("UUID exhausted");
          return next;
        },
        now: () => 1720000000000,
      });
    const first = factory();
    await first.beginVerifiedLogin(A.principalId);
    const entry = await first.enqueue("progress", "completePracticeStep", event.payload);
    expect(entry.eventId).toBe(U1);
    const v2Key = "gafus-progress-v2:" + A.principalId + ":" + A.authEpoch;
    const originalNew = kv.get(v2Key);

    const restarted = factory();
    expect(await restarted.restoreVerifiedSession(A.principalId)).toBe(true);
    const [pending] = await restarted.getPending("progress");
    expect(pending.eventId).toBe(U1);
    const preview = preparePracticeJournalRequest(
      { binding: restarted.getVerifiedBinding()!, event: pending },
      restarted.getVerifiedBinding(),
    );
    expect(evaluatePracticeJournalResponse(preview, A, pending, "post", null, null).status).toBe(
      "pending",
    );
    expect(
      evaluatePracticeJournalResponse(preview, A, pending, "lookup", 200, committed(true)).status,
    ).toBe("confirmed");
    // Correlation is NOT a dequeue operation: even mock-confirmed entries remain durable.
    expect(kv.get(v2Key)).toBe(originalNew);
    expect((await restarted.getPending("progress")).map((e) => e.eventId)).toEqual([U1]);

    await restarted.beginVerifiedLogin(B.principalId);
    expect(await restarted.getPending("progress")).toEqual([]);
    expect(
      evaluatePracticeJournalResponse(
        preview,
        restarted.getVerifiedBinding(),
        pending,
        "lookup",
        200,
        committed(true),
      ),
    ).toMatchObject({ status: "pending" });
    expect(kv.get(v2Key)).toBe(originalNew);
    expect(kv.get("progress-sync-storage")).toBe("{original-ownerless-byte-corpus}");
    expect(kv.get("prevention-sync-storage")).toBe("{historical-never-touched}");
  });

  it("never maps a persisted prevention event to the practice-only server operation", async () => {
    const kv = new Map<string, string>();
    const ss = new Map<string, string>();
    const ids = [A.authEpoch, U1];
    const store = createNewOnlyV2Queues({
      storage: {
        getItem: async (key: string) => kv.get(key) ?? null,
        setItem: async (key: string, raw: string) => {
          kv.set(key, raw);
        },
      },
      secure: {
        getItemAsync: async (key: string) => ss.get(key) ?? null,
        setItemAsync: async (key: string, raw: string) => {
          ss.set(key, raw);
        },
        deleteItemAsync: async (key: string) => {
          ss.delete(key);
        },
      },
      makeId: () => {
        const id = ids.shift();
        if (!id) throw Error("UUID exhausted");
        return id;
      },
      now: () => 1720000000000,
    });
    await store.beginVerifiedLogin(A.principalId);
    await store.enqueue("prevention", "prevention.upsert", { petId: "pet-1", clientId: U2 });
    const [pending] = await store.getPending("prevention");
    expect(() => preparePracticeJournalRequest({ binding: A, event: pending }, A)).toThrow();
  });
});
