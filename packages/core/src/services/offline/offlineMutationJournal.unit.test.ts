/** OFF021 new-only journal SQL choreography using MOCK Prisma only.
 * Actual concurrency/rollback requires AG4-approved isolated PostgreSQL lease.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
type Row = {
  ownerId: string;
  eventId: string;
  operation: string;
  resourceKey: string;
  payloadHash: string;
  state: string;
  responseBody: unknown;
  revision: bigint;
  method: string;
};
type Raw = { sql: string; values: unknown[] };
const m = vi.hoisted(() => ({
  apply: vi.fn(),
  sync: vi.fn(),
  rows: new Map<string, unknown>(),
  revisions: new Map<string, bigint>(),
  missingTable: false,
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("<?>"),
      values,
    }),
  },
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const rows = new Map(m.rows),
        revisions = new Map(m.revisions);
      const tx = {
        $queryRaw: async (raw: Raw) => {
          if (m.missingTable) throw { code: "P2010", meta: { code: "42P01" } };
          if (raw.sql.includes('INSERT INTO "OfflineMutationReceipt"')) {
            const [id, ownerId, eventId, operation, resourceKey, payloadHash] =
              raw.values as string[];
            const key = ownerId + ":" + eventId;
            if (rows.has(key)) return [];
            rows.set(key, {
              ownerId,
              eventId,
              operation,
              resourceKey,
              payloadHash,
              state: "RESERVED",
              method: "POST",
              responseBody: null,
              revision: 0n,
              id,
            });
            return [{ id }];
          }
          if (raw.sql.includes('SELECT "method", "operation"')) {
            const [ownerId, eventId] = raw.values as string[];
            const r = rows.get(ownerId + ":" + eventId);
            return r ? [r] : [];
          }
          if (raw.sql.includes('INSERT INTO "OfflineResourceRevision"')) {
            const [ownerId, resourceKey] = raw.values as string[];
            const key = ownerId + ":" + resourceKey;
            const next = (revisions.get(key) ?? 0n) + 1n;
            revisions.set(key, next);
            return [{ revision: next }];
          }
          throw Error("Unexpected mocked SQL read statement: " + raw.sql);
        },
        $executeRaw: async (raw: Raw) => {
          if (m.missingTable) throw { code: "P2010", meta: { code: "42P01" } };
          const [revision, rawBody, id, ownerId] = raw.values as [bigint, string, string, string];
          const row = [...rows.values()].find((r) => r.ownerId === ownerId && r.id === id);
          if (!row) return 0;
          row.state = "COMMITTED";
          row.revision = revision;
          row.responseBody = JSON.parse(rawBody);
          return 1;
        },
      };
      const response = await fn(tx);
      m.rows.clear();
      for (const [k, v] of rows) m.rows.set(k, v);
      m.revisions.clear();
      for (const [k, v] of revisions) m.revisions.set(k, v);
      return response;
    },
    $queryRaw: async (raw: Raw) => {
      if (m.missingTable) throw { code: "P2010", meta: { code: "42P01" } };
      const [ownerId, eventId] = raw.values as string[];
      const row = m.rows.get(ownerId + ":" + eventId) as Row | undefined;
      return row ? [{ state: row.state, responseBody: row.responseBody }] : [];
    },
  },
}));
vi.mock("../training/trainingService", () => ({
  applyStepAndDayTx: m.apply,
  syncUserCourseStatusFromDaysTx: m.sync,
}));
import {
  submitNewOfflinePracticeMutation,
  findNewOfflineMutationReceipt,
} from "./offlineMutationJournal";
const id = "514acd7f-3e91-42d1-8409-05dd8cc82911";
const input = {
  ownerId: "synthetic-A",
  eventId: id,
  operation: "training.complete.practice" as const,
  courseId: "clwcourse00000000000000001",
  dayOnCourseId: "clwdayoc0000000000000001",
  stepIndex: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.rows.clear();
  m.revisions.clear();
  m.missingTable = false;
  m.apply.mockResolvedValue({
    courseId: input.courseId,
    allCompleted: true,
    stepJustCompleted: true,
  });
  m.sync.mockResolvedValue(undefined);
});
describe("AG1 OFF021 actual journal source with mock-only SQL adapter", () => {
  it("JM01 creates original receipt with stable revision, one Core mutation and one course sync", async () => {
    const r = await submitNewOfflinePracticeMutation(input);
    expect(r).toMatchObject({
      success: true,
      ack: { eventId: id, protocol: 2, state: "COMMITTED", replayed: false, serverRevision: "1" },
    });
    expect(m.apply).toHaveBeenCalledTimes(1);
    expect(m.sync).toHaveBeenCalledTimes(1);
    expect(m.rows.size).toBe(1);
  });
  it("JM02 retry with same payload returns original ACK without new Core, course sync or resource revision", async () => {
    const first = await submitNewOfflinePracticeMutation(input);
    const other = await submitNewOfflinePracticeMutation(input);
    expect(other.ack).toMatchObject({
      eventId: id,
      replayed: true,
      serverRevision: first.ack.serverRevision,
    });
    expect(m.apply).toHaveBeenCalledTimes(1);
    expect(m.sync).toHaveBeenCalledTimes(1);
    expect(m.revisions.size).toBe(1);
  });
  it("JM03 changed payload and SAME eventId conflicts, no ACK or extra writes", async () => {
    await submitNewOfflinePracticeMutation(input);
    await expect(
      submitNewOfflinePracticeMutation({ ...input, stepIndex: 1 }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(m.rows.size).toBe(1);
    expect(m.apply).toHaveBeenCalledTimes(1);
  });
  it("JM04 same eventId with different authenticated owner has isolated receipt, no cross-owner response", async () => {
    await submitNewOfflinePracticeMutation(input);
    expect(await findNewOfflineMutationReceipt("synthetic-B", id)).toBeNull();
    expect((await findNewOfflineMutationReceipt("synthetic-A", id))?.ack).toMatchObject({
      eventId: id,
      replayed: true,
    });
  });
  it("JM05 sync failure after mocked step rejects, no committed receipt in synthetic adapter", async () => {
    m.sync.mockRejectedValueOnce(Error("SYNTHETIC_COURSE_SYNC_ERROR"));
    await expect(submitNewOfflinePracticeMutation(input)).rejects.toThrow(
      "SYNTHETIC_COURSE_SYNC_ERROR",
    );
    expect(m.rows.size).toBe(0);
    expect(m.revisions.size).toBe(0);
    expect(m.apply).toHaveBeenCalledTimes(1);
  });
  it("JM06 unapplied journal table gets retryable 503 machine status, not fallback to legacy", async () => {
    m.missingTable = true;
    await expect(submitNewOfflinePracticeMutation(input)).rejects.toMatchObject({
      code: "JOURNAL_UNAVAILABLE",
    });
    await expect(findNewOfflineMutationReceipt(input.ownerId, id)).rejects.toMatchObject({
      code: "JOURNAL_UNAVAILABLE",
    });
  });
  it("JM07 unknown event returns null rather than fabricated ACK", async () => {
    expect(await findNewOfflineMutationReceipt(input.ownerId, randomUUID())).toBeNull();
  });
  it("JM08 reserved-but-not-committed receipt never treated as replay success", async () => {
    m.rows.set(input.ownerId + ":" + id, {
      ownerId: input.ownerId,
      eventId: id,
      method: "POST",
      operation: input.operation,
      resourceKey: `training:${input.dayOnCourseId}:step:0`,
      payloadHash: "invalid",
      state: "RESERVED",
      responseBody: null,
      revision: 0n,
      id: randomUUID(),
    });
    await expect(findNewOfflineMutationReceipt(input.ownerId, id)).rejects.toMatchObject({
      code: "JOURNAL_UNAVAILABLE",
    });
  });
});
