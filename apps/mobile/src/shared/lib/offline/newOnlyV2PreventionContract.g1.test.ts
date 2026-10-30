import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNewOnlyV2Queues } from "./newOnlyV2Queues";
import type { V2PendingEvent } from "./newOnlyV2Queues";
import {
  evaluatePreventionJournalContract,
  preparePreventionJournalContract,
  type PreventionSnapshot,
} from "./newOnlyV2PreventionContract";

const A = {
  schemaVersion: 2 as const,
  principalId: "USER_A",
  authEpoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
};
const B = { ...A, principalId: "USER_B", authEpoch: "d8f37921-b880-4b04-ae14-96c2e749b029" };
const A2 = { ...A, authEpoch: "a73ed977-3952-4791-b2db-318f84bc1642" };
const PARENT = "8ae52e9a-580f-4ab8-9545-397973bc32f5";
const I1 = "23a47d4c-9b22-4f0b-a0e6-06d634e7a701";
const I2 = "23a47d4c-9b22-4f0b-a0e6-06d634e7a702";
const C1 = "71243d0c-a88f-4999-b74e-0c72f38782f1";
const C2 = "71243d0c-a88f-4999-b74e-0c72f38782f2";
const PET = "synthetic-petA";
const item1 = {
  eventId: I1,
  clientId: C1,
  type: "VACCINATION",
  performedAt: "2026-10-16T12:00:00.000Z",
  reminderEnabled: false,
};
const item2 = {
  eventId: I2,
  clientId: C2,
  type: "DEWORMING",
  performedAt: "2026-10-16T12:00:00.000Z",
  reminderEnabled: false,
};
const event: V2PendingEvent = {
  eventId: PARENT,
  createdAt: 1720000000000,
  kind: "prevention.upsert",
  payload: { petId: PET, entries: [item1, item2] },
};
const snapshot = (binding = A, value = event): PreventionSnapshot => ({ binding, event: value });
const ack = (replayed = false) => ({
  success: true,
  ack: {
    protocol: 2,
    eventId: PARENT,
    operation: "prevention.batch",
    state: "COMMITTED",
    replayed,
    serverRevision: "1",
    items: [
      { eventId: I1, clientId: C1, state: "COMMITTED", result: "CREATED", serverRowId: "row1" },
      { eventId: I2, clientId: C2, state: "COMMITTED", result: "CREATED", serverRowId: "row2" },
    ],
  },
});
const decide = (
  body: unknown,
  kind: "post" | "lookup" = "post",
  active = A,
  value = event,
  status: number | null = 200,
) =>
  evaluatePreventionJournalContract(
    preparePreventionJournalContract(snapshot(), A),
    active,
    value,
    kind,
    status,
    body,
  );

describe("AG3 OFF021 prevention.batch pure contract compatibility", () => {
  it("builds exact AG1 POST/GET for parent eventId and each independent itemEventId/clientId", () => {
    const request = preparePreventionJournalContract(snapshot(), A);
    expect(request.post).toEqual({
      method: "POST",
      path: "/api/v1/offline/mutations",
      headers: { "X-Gafus-Sync-Protocol": "2", "Idempotency-Key": PARENT },
      body: { eventId: PARENT, operation: "prevention.batch", petId: PET, entries: [item1, item2] },
    });
    expect(request.lookup).toEqual({
      method: "GET",
      path: "/api/v1/offline/mutations/" + PARENT,
      headers: { "X-Gafus-Sync-Protocol": "2" },
    });
    expect(JSON.stringify(request)).not.toMatch(
      /USER_A|authEpoch|X-Client-Auth-Epoch|accessToken|old.upsert/i,
    );
    expect([
      request.post.body.eventId,
      ...request.post.body.entries.map((x) => x.eventId),
      ...request.post.body.entries.map((x) => x.clientId),
    ]).toHaveLength(5);
    expect(
      new Set([
        request.post.body.eventId,
        ...request.post.body.entries.map((x) => x.eventId),
        ...request.post.body.entries.map((x) => x.clientId),
      ]).size,
    ).toBe(5);
  });

  it("matches AG1 normalized parent and per-item canonical SHA256 input (not raw JSON)", () => {
    const req = preparePreventionJournalContract(snapshot(), A);
    const expectedItems = [item1, item2].map((item) => ({
      eventId: item.eventId,
      clientId: item.clientId,
      type: item.type,
      performedAt: item.performedAt,
      productName: null,
      notes: null,
      reminderEnabled: false,
      reminderKind: "AFTER_DAYS",
      reminderDaysAfter: null,
      reminderOnDate: null,
      reminderTimes: ["09:00"],
    }));
    expect(req.canonicalFingerprintInput).toBe(
      JSON.stringify({
        method: "POST",
        operation: "prevention.batch",
        petId: PET,
        entries: expectedItems,
      }),
    );
    expect(req.canonicalItemFingerprintInputs).toEqual(expectedItems.map((i) => JSON.stringify(i)));
    expect(createHash("sha256").update(req.canonicalFingerprintInput).digest("hex")).toBe(
      "6700a4289dd1e7b1cb991541fa35322403e6abd6074c36f71ad922fc5ea893a4",
    );
    expect(
      req.canonicalItemFingerprintInputs.map((v) => createHash("sha256").update(v).digest("hex")),
    ).toEqual([
      "26dc2756d1431fe12869823c5153164ebaf0471b7809bd1eda794cec0aecfd10",
      "85456ab706308adabe0be336020c0f6b590eb6bb99753229df76a033657c042b",
    ]);
    expect(req.canonicalFingerprintInput).not.toContain("USER_A");
    expect(req.canonicalFingerprintInput).not.toContain(A.authEpoch);
  });

  it("normalizes timezone, nullable defaults, reminder options and typed fields exactly", () => {
    const decorated = {
      ...item1,
      performedAt: "2026-10-16T15:00:00+03:00",
      productName: "synthetic",
      notes: "",
      reminderEnabled: true,
      reminderKind: "ON_DATE",
      reminderDaysAfter: 7,
      reminderOnDate: "2026-11-16T12:00:00.000Z",
      reminderTimes: ["08:00", "21:30"],
    };
    const e = { ...event, payload: { petId: PET, entries: [decorated] } };
    const req = preparePreventionJournalContract(snapshot(A, e), A);
    expect(req.post.body.entries[0]).toEqual({
      ...decorated,
      performedAt: "2026-10-16T12:00:00.000Z",
    });
    expect(JSON.parse(req.canonicalFingerprintInput).entries[0]).toEqual({
      eventId: I1,
      clientId: C1,
      type: "VACCINATION",
      performedAt: "2026-10-16T12:00:00.000Z",
      productName: "synthetic",
      notes: "",
      reminderEnabled: true,
      reminderKind: "ON_DATE",
      reminderDaysAfter: 7,
      reminderOnDate: "2026-11-16T12:00:00.000Z",
      reminderTimes: ["08:00", "21:30"],
    });
  });

  it("accepts correlated COMPLETE atomic per-item ACK in original item order, without deletion", () => {
    expect(decide(ack())).toEqual({ status: "confirmed", eventId: PARENT, replayed: false });
    expect(decide(ack(true), "lookup")).toEqual({
      status: "confirmed",
      eventId: PARENT,
      replayed: true,
    });
  });

  it("lost POST response stays pending; GET retrieves ONLY full stored replayed receipt", () => {
    const req = preparePreventionJournalContract(snapshot(), A);
    expect(evaluatePreventionJournalContract(req, A, event, "post", null, null)).toEqual({
      status: "pending",
    });
    expect(
      evaluatePreventionJournalContract(req, A, event, "lookup", 404, {
        success: false,
        code: "NOT_FOUND",
      }),
    ).toEqual({ status: "pending" });
    expect(evaluatePreventionJournalContract(req, A, event, "lookup", 200, ack(false))).toEqual({
      status: "pending",
    });
    expect(evaluatePreventionJournalContract(req, A, event, "lookup", 200, ack(true))).toEqual({
      status: "confirmed",
      eventId: PARENT,
      replayed: true,
    });
  });

  it("rejects partial, duplicate, swapped, wrong clientId/itemId, bad revision and aggregate-only receipts", () => {
    const valid = ack();
    const cases: unknown[] = [
      { success: true },
      { success: true, data: { created: 2, updated: 0, errors: [] } },
      { success: true, ack: { ...valid.ack, items: valid.ack.items.slice(0, 1) } },
      { success: true, ack: { ...valid.ack, items: [valid.ack.items[0], valid.ack.items[0]] } },
      { success: true, ack: { ...valid.ack, items: [...valid.ack.items].reverse() } },
      {
        success: true,
        ack: { ...valid.ack, items: [{ ...valid.ack.items[0], clientId: C2 }, valid.ack.items[1]] },
      },
      {
        success: true,
        ack: { ...valid.ack, items: [{ ...valid.ack.items[0], eventId: I2 }, valid.ack.items[1]] },
      },
      {
        success: true,
        ack: {
          ...valid.ack,
          items: [{ ...valid.ack.items[0], state: "RESERVED" }, valid.ack.items[1]],
        },
      },
      {
        success: true,
        ack: {
          ...valid.ack,
          items: [{ ...valid.ack.items[0], result: "REPLAYED" }, valid.ack.items[1]],
        },
      },
      {
        success: true,
        ack: {
          ...valid.ack,
          items: [{ ...valid.ack.items[0], serverRowId: "" }, valid.ack.items[1]],
        },
      },
      { success: true, ack: { ...valid.ack, eventId: I1 } },
      { success: true, ack: { ...valid.ack, operation: "training.complete.practice" } },
      { success: true, ack: { ...valid.ack, protocol: 1 } },
      { success: true, ack: { ...valid.ack, serverRevision: "0" } },
    ];
    for (const response of cases) expect(decide(response)).toEqual({ status: "pending" });
  });

  it("refuses owner A->B, epoch E1->E3, missing verified binding and pending changed payload", () => {
    for (const binding of [B, A2, null]) {
      expect(() => preparePreventionJournalContract(snapshot(), binding)).toThrow();
      expect(
        evaluatePreventionJournalContract(
          preparePreventionJournalContract(snapshot(), A),
          binding,
          event,
          "post",
          200,
          ack(),
        ),
      ).toEqual({ status: "pending" });
    }
    expect(
      decide(ack(), "post", A, {
        ...event,
        payload: { petId: PET, entries: [{ ...item1, productName: "CHANGED" }, item2] },
      }),
    ).toEqual({ status: "pending" });
    expect(
      decide(ack(), "post", A, {
        ...event,
        payload: { petId: PET, entries: [item2, item1] },
      }),
    ).toEqual({ status: "pending" });
  });

  it("never adopts an already-bound clientId in a new parent event, and changed immutable item stays pending", () => {
    const original = preparePreventionJournalContract(snapshot(), A);
    const later = { ...event, eventId: "346ed6e4-bfa1-4b3b-88da-5b0f9017cae7" };
    const attempt = preparePreventionJournalContract(snapshot(A, later), A);
    expect(attempt.post.body.entries.map((x) => x.clientId)).toEqual([C1, C2]);
    expect(attempt.post.body.eventId).not.toBe(original.post.body.eventId);
    // The server rejects a new batch that reuses the bound (petId,clientId).
    // A pure local parser cannot prove whether the server has already bound it.
    expect(
      evaluatePreventionJournalContract(attempt, A, later, "post", 409, {
        success: false,
        code: "IDEMPOTENCY_KEY_CONFLICT",
      }),
    ).toEqual({ status: "pending" });
    for (const modified of [
      { ...item1, clientId: C2 },
      { ...item1, eventId: I2 },
      { ...item1, performedAt: "2026-10-18T12:00:00.000Z" },
      { ...item1, reminderTimes: ["10:00"] },
    ]) {
      const altered = { ...event, payload: { petId: PET, entries: [modified, item2] } };
      expect(
        evaluatePreventionJournalContract(original, A, altered, "lookup", 200, ack(true)),
      ).toEqual({ status: "pending" });
    }
  });

  it("rejects duplicate item clientIds and independent item eventIds before constructing a request", () => {
    const dupClient = { ...item2, clientId: C1 };
    const dupEvent = { ...item2, eventId: I1 };
    for (const items of [
      [item1, dupClient],
      [item1, dupEvent],
    ]) {
      expect(() =>
        preparePreventionJournalContract(
          snapshot(A, {
            ...event,
            payload: { petId: PET, entries: items },
          }),
          A,
        ),
      ).toThrow();
    }
  });

  it("rejects historical ownerless payload, missing clientId/eventId, credential fields, malformed dates and bad reminders", () => {
    for (const entries of [
      [{ ...item1, clientId: undefined }],
      [{ ...item1, eventId: undefined }],
      [{ ...item1, performedAt: "not-a-date" }],
      [{ ...item1, type: "UNSUPPORTED" }],
      [{ ...item1, reminderTimes: ["25:90"] }],
      [{ ...item1, reminderDaysAfter: 0 }],
      [{ ...item1, accessToken: "private" }],
    ]) {
      expect(() =>
        preparePreventionJournalContract(
          snapshot(A, {
            ...event,
            payload: { petId: PET, entries },
          }),
          A,
        ),
      ).toThrow();
    }
    expect(() =>
      preparePreventionJournalContract(
        snapshot(A, {
          ...event,
          payload: { petId: PET, clientId: C1 },
        }),
        A,
      ),
    ).toThrow();
  });

  it("never confirms 400/401/403/404 old node/409 immutable conflict/429/500/503, even success:true", () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      expect(decide(ack(), "post", A, event, status)).toEqual({ status: "pending" });
      expect(decide(ack(true), "lookup", A, event, status)).toEqual({ status: "pending" });
    }
  });

  it("preserves actual v2 prevention envelope across restart, owner switch and fake per-item ACK", async () => {
    const kv = new Map<string, string>([
      ["progress-sync-storage", '{"legacy":true}'],
      ["prevention-sync-storage", "{historical-owner-unknown}"],
      ["offline-storage", "{historic-media}"],
    ]);
    const ss = new Map<string, string>();
    const ids = [A.authEpoch, PARENT, B.authEpoch];
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
    const store = () =>
      createNewOnlyV2Queues({
        storage,
        secure,
        now: () => 1720000000000,
        makeId: () => {
          const id = ids.shift();
          if (!id) throw Error("UUID pool empty");
          return id;
        },
      });
    const instance = store();
    await instance.beginVerifiedLogin(A.principalId);
    const persisted = await instance.enqueue("prevention", "prevention.upsert", event.payload);
    expect(persisted.eventId).toBe(PARENT);
    const key = "gafus-prevention-v2:" + A.principalId + ":" + A.authEpoch;
    const before = kv.get(key);
    const restarted = store();
    expect(await restarted.restoreVerifiedSession(A.principalId)).toBe(true);
    const [pending] = await restarted.getPending("prevention");
    const preview = preparePreventionJournalContract(
      { binding: restarted.getVerifiedBinding()!, event: pending },
      restarted.getVerifiedBinding(),
    );
    expect(evaluatePreventionJournalContract(preview, A, pending, "post", null, null)).toEqual({
      status: "pending",
    });
    expect(
      evaluatePreventionJournalContract(preview, A, pending, "lookup", 200, ack(true)),
    ).toEqual({ status: "confirmed", eventId: PARENT, replayed: true });
    // Phase1 has no ACK/dequeue storage mutation; synthetic confirmation changes no bytes.
    expect(kv.get(key)).toBe(before);
    await restarted.beginVerifiedLogin(B.principalId);
    expect(await restarted.getPending("prevention")).toEqual([]);
    expect(
      evaluatePreventionJournalContract(
        preview,
        restarted.getVerifiedBinding(),
        pending,
        "lookup",
        200,
        ack(true),
      ),
    ).toEqual({ status: "pending" });
    expect(kv.get(key)).toBe(before);
    expect(kv.get("prevention-sync-storage")).toBe("{historical-owner-unknown}");
    expect(kv.get("offline-storage")).toBe("{historic-media}");
  });
});
