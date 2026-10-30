/**
 * AG1 controlled two-client transaction MOCK — never real PostgreSQL evidence.
 * Each worker has its own transaction-local writes and separately owned row locks.
 * No db.serial, external database, scheduler, runtime API or provider connection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Receipt = {
  ownerUserId: string;
  operationKey: string;
  operationKind: string;
  fingerprint: string;
  state: string;
  reminderId: string | null;
  responseJson: unknown;
  expiresAt: Date;
  createdAt: Date;
};

type Selection = { transactionId: number; keys: string[] };
type FirstBarrier = {
  acquired: () => void;
  failed: (error: unknown) => void;
  release: Promise<void>;
  rollback: boolean;
};

type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

const db = vi.hoisted(() => ({
  rows: new Map<string, Receipt>(),
  locks: new Map<string, number>(),
  selections: [] as Selection[],
  clients: new Map<number, object>(),
  running: new Set<number>(),
  peakOverlap: 0,
  nextTransactionId: 0,
  clock: new Date("2026-10-19T10:00:00.000Z"),
  firstBarrier: undefined as FirstBarrier | undefined,
  firstQueryError: false,
}));

const ZERO = "0".repeat(64);
const primaryKey = (row: Receipt): string =>
  `${row.ownerUserId}:${row.operationKey}`;

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async <T>(action: (client: {
      $queryRaw: (parts: TemplateStringsArray, ...bindings: unknown[]) =>
        Promise<{ affectedCount: number }[]>;
    }) => Promise<T>): Promise<T> => {
      const transactionId = ++db.nextTransactionId;
      const staged = new Map<string, Receipt>();
      const ownedLocks: string[] = [];
      let queryCount = 0;
      const client = {
        $queryRaw: async (parts: TemplateStringsArray, ...bindings: unknown[]) => {
          try {
            queryCount++;
            if (queryCount !== 1) throw new Error("MOCK_REQUIRES_ONE_SQL_STATEMENT");
            if (transactionId === 1 && db.firstQueryError) {
              throw new Error("MOCK_FIRST_QUERY_ERROR_BEFORE_ACQUIRED_BARRIER");
            }
            const sql = parts.join("?PARAM?");
            const required = [
              "WITH expired AS MATERIALIZED",
              "CURRENT_TIMESTAMP",
              "FOR UPDATE SKIP LOCKED",
              "LIMIT ?PARAM?",
              '"responseJson" = NULL',
              '"reminderId" = NULL',
              '"fingerprint" = ?PARAM?',
              '"state" = \'EXPIRED\'',
              '"ownerUserId" = expired."ownerUserId"',
              '"operationKey" = expired."operationKey"',
              "RETURNING 1",
              'COUNT(*)::integer AS "affectedCount"',
            ];
            for (const fragment of required) {
              if (!sql.includes(fragment)) throw new Error("MOCK_SQL_SHAPE_CHANGED");
            }
            const [oldFingerprint, limit, newFingerprint] = bindings;
            if (oldFingerprint !== ZERO || newFingerprint !== ZERO ||
              typeof limit !== "number" || !Number.isSafeInteger(limit) ||
              limit < 1 || limit > 200) {
              throw new Error("MOCK_BATCH_BINDINGS_CHANGED");
            }

            // No global transaction queue: transaction B runs while A holds locks.
            // Only committed rows are visible in shared storage.
            const available = [...db.rows.entries()]
              .filter(([key, row]) => {
                if (db.locks.has(key) || row.expiresAt > db.clock) return false;
                return row.responseJson !== null || row.reminderId !== null ||
                  row.fingerprint !== ZERO || row.state !== "EXPIRED";
              })
              .sort(([keyA, a], [keyB, b]) =>
                a.expiresAt.getTime() - b.expiresAt.getTime() ||
                keyA.localeCompare(keyB))
              .slice(0, limit);
            for (const [key, row] of available) {
              if (db.locks.has(key)) throw new Error("MOCK_DOUBLE_ROW_LOCK");
              db.locks.set(key, transactionId);
              ownedLocks.push(key);
              staged.set(key, {
                ...row,
                responseJson: null,
                reminderId: null,
                fingerprint: ZERO,
                state: "EXPIRED",
              });
            }
            db.selections.push({ transactionId, keys: [...ownedLocks] });
            if (transactionId === 1 && db.firstBarrier) {
              db.firstBarrier.acquired();
              await db.firstBarrier.release;
              if (db.firstBarrier.rollback) {
                throw new Error("MOCK_TX_A_FORCED_ROLLBACK");
              }
            }
            return [{ affectedCount: available.length }];
          } catch (error) {
            // A failure *before* the acquisition signal must reject the signal:
            // the controller cannot be left awaiting a barrier forever.
            if (transactionId === 1) db.firstBarrier?.failed(error);
            throw error;
          }
        },
      };
      db.clients.set(transactionId, client);
      db.running.add(transactionId);
      db.peakOverlap = Math.max(db.peakOverlap, db.running.size);
      try {
        const result = await action(client);
        // Transaction-local mutations become visible only on successful commit.
        for (const [key, row] of staged) db.rows.set(key, row);
        return result;
      } finally {
        // On commit or rollback, never unlock another worker's locks.
        for (const key of ownedLocks) {
          if (db.locks.get(key) === transactionId) db.locks.delete(key);
        }
        db.running.delete(transactionId);
      }
    },
  },
}));

import { redactExpiredReminderReceiptPII } from
  "./g1ReminderExpiryPIIRedaction.review";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // The error may occur before a test awaits the acquisition signal.
  // Mark that rejection handled immediately; the original still rejects.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`MOCK_BARRIER_TIMEOUT:${label}`)), 4_000);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function observed<T>(promise: Promise<T>): Promise<Outcome<T>> {
  // Attach rejection handling in the very same turn as worker creation.
  return promise.then(
    (value): Outcome<T> => ({ status: "fulfilled", value }),
    (reason): Outcome<T> => ({ status: "rejected", reason }),
  );
}

function seed201(): Map<string, Receipt> {
  for (let index = 1; index <= 202; index++) {
    const active = index === 202;
    const receipt: Receipt = {
      ownerUserId: "owner-A",
      operationKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      operationKind: "CREATE",
      fingerprint: "a".repeat(64),
      state: index % 2 === 0 ? "PENDING" : "COMMITTED",
      reminderId: `reminder-${index}`,
      responseJson: { name: `PRIVATE_NAME_${index}`, id: `reminder-${index}` },
      expiresAt: new Date(db.clock.getTime() + (active ? 60_000 : -60_000)),
      createdAt: new Date(db.clock.getTime() - 120_000),
    };
    db.rows.set(primaryKey(receipt), receipt);
  }
  return new Map([...db.rows].map(([key, row]) => [key, structuredClone(row)]));
}

function assertExactBeforeAfter(original: Map<string, Receipt>, committed: Set<string>) {
  expect(db.rows.size).toBe(original.size);
  for (const [key, before] of original) {
    const expected = committed.has(key) ? {
      ...before,
      responseJson: null,
      reminderId: null,
      fingerprint: ZERO,
      state: "EXPIRED",
    } : before;
    expect(db.rows.get(key)).toStrictEqual(expected);
  }
  expect(db.rows.get([...original.keys()].at(-1)!)).toStrictEqual(
    [...original.values()].at(-1),
  ); // Active receipt must be byte-for-byte unchanged.
}

function assertNoAbandonedLocks() {
  expect(db.locks.size).toBe(0);
  expect(db.running.size).toBe(0);
}

async function acquiredOrWorkerError(
  signal: Promise<void>, workerA: Promise<Outcome<number>>,
) {
  return bounded(Promise.race([
    signal,
    workerA.then((outcome) => {
      throw new Error(
        outcome.status === "rejected" ?
          `MOCK_WORKER_STOPPED_BEFORE_ACQUIRED:${String(outcome.reason)}` :
          "MOCK_WORKER_COMPLETED_BEFORE_ACQUIRED",
      );
    }),
  ]), "acquired-or-worker-error");
}

beforeEach(() => {
  db.rows.clear();
  db.locks.clear();
  db.selections.length = 0;
  db.clients.clear();
  db.running.clear();
  db.peakOverlap = 0;
  db.nextTransactionId = 0;
  db.firstBarrier = undefined;
  db.firstQueryError = false;
});

describe("AG1 two independent SKIP LOCKED transaction clients — MOCK ONLY", () => {
  async function testOverlap(rollbackFirst: boolean) {
    const original = seed201();
    const acquired = deferred<void>();
    const release = deferred<void>();
    db.firstBarrier = {
      acquired: () => acquired.resolve(),
      failed: (error) => acquired.reject(error),
      release: release.promise,
      rollback: rollbackFirst,
    };
    const workerA = observed(redactExpiredReminderReceiptPII());
    let workerB: Promise<Outcome<number>> | undefined;
    try {
      await acquiredOrWorkerError(acquired.promise, workerA);
      expect(db.selections).toHaveLength(1);
      expect(db.selections[0].keys).toHaveLength(200);
      expect(db.locks.size).toBe(200);
      expect(db.rows).toEqual(original); // A has not committed private writes.

      workerB = observed(redactExpiredReminderReceiptPII());
      const outcomeB = await bounded(workerB, "worker-B-commits");
      expect(outcomeB.status).toBe("fulfilled");
      if (outcomeB.status !== "fulfilled") throw outcomeB.reason;
      expect(outcomeB.value).toBe(1);
      expect(db.peakOverlap).toBe(2);
      expect(db.clients.get(1)).not.toBe(db.clients.get(2));
      expect(db.selections[1]).toMatchObject({ transactionId: 2 });
      expect(db.selections[1].keys).toHaveLength(1);
      expect(db.selections[1].keys[0]).not.toBeUndefined();
      expect(db.selections[0].keys).not.toContain(db.selections[1].keys[0]);
      expect(db.locks.size).toBe(200); // A still holds its selection.
      assertExactBeforeAfter(original, new Set(db.selections[1].keys));
    } finally {
      release.resolve();
      // Both workers are observed even when a barrier/assertion fails.
      await bounded(Promise.allSettled([workerA, ...(workerB ? [workerB] : [])]),
        "release-and-reap-both-workers");
    }

    const outcomeA = await bounded(workerA, "worker-A-settled");
    if (rollbackFirst) {
      expect(outcomeA.status).toBe("rejected");
      if (outcomeA.status === "rejected") {
        expect(String(outcomeA.reason)).toContain("MOCK_TX_A_FORCED_ROLLBACK");
      }
      assertExactBeforeAfter(original, new Set(db.selections[1].keys));
      assertNoAbandonedLocks();
      const countC = await redactExpiredReminderReceiptPII();
      expect(countC).toBe(200);
      expect(db.selections[2].keys).toEqual(db.selections[0].keys);
    } else {
      expect(outcomeA).toEqual({ status: "fulfilled", value: 200 });
    }
    const allExpiredKeys = new Set([...original].filter(([, row]) =>
      row.expiresAt <= db.clock).map(([key]) => key));
    expect(allExpiredKeys.size).toBe(201);
    assertExactBeforeAfter(original, allExpiredKeys);
    assertNoAbandonedLocks();
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    assertExactBeforeAfter(original, allExpiredKeys);
    assertNoAbandonedLocks();
  }

  it("C01 two independently overlapping mock transactions process 200+1, no double writes", async () => {
    await testOverlap(false);
  }, 15_000);

  it("C02 rollback A while B commits one, retry redacts remaining 200", async () => {
    await testOverlap(true);
  }, 15_000);

  it("C03 query error before acquired signal rejects promptly; both workers reaped", async () => {
    seed201();
    const acquired = deferred<void>();
    const release = deferred<void>();
    db.firstQueryError = true;
    db.firstBarrier = {
      acquired: () => acquired.resolve(),
      failed: (error) => acquired.reject(error),
      release: release.promise,
      rollback: false,
    };
    const workerA = observed(redactExpiredReminderReceiptPII());
    // Launch worker B immediately, independently, and attach its error handler.
    const workerB = observed(redactExpiredReminderReceiptPII());
    try {
      await expect(acquiredOrWorkerError(acquired.promise, workerA)).rejects.toThrow(
        "MOCK_FIRST_QUERY_ERROR_BEFORE_ACQUIRED_BARRIER",
      );
    } finally {
      release.resolve();
      await bounded(Promise.allSettled([workerA, workerB]),
        "failed-acquisition-release-and-reap-both-workers");
    }
    expect(await workerA).toMatchObject({ status: "rejected" });
    expect(await workerB).toEqual({ status: "fulfilled", value: 200 });
    assertNoAbandonedLocks();
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    assertNoAbandonedLocks();
  }, 15_000);

  it("C04 a missing acquired notification times out but releases A without hang", async () => {
    seed201();
    const acquired = deferred<void>();
    const release = deferred<void>();
    db.firstBarrier = {
      acquired: () => { /* simulate lost acquisition notification */ },
      failed: (error) => acquired.reject(error),
      release: release.promise,
      rollback: false,
    };
    const workerA = observed(redactExpiredReminderReceiptPII());
    const workerB = observed(redactExpiredReminderReceiptPII());
    try {
      // Even if the notification is lost, the bounded test must not hang.
      await expect(bounded(Promise.race([
        acquired.promise,
        workerA.then(() => { throw new Error("EARLY_WORKER_EXIT"); }),
      ]), "intentional-missing-acquired-notification")).rejects.toThrow(
        "MOCK_BARRIER_TIMEOUT:intentional-missing-acquired-notification",
      );
    } finally {
      release.resolve();
      await bounded(Promise.allSettled([workerA, workerB]),
        "timeout-release-and-reap-both-workers");
    }
    expect(await workerA).toEqual({ status: "fulfilled", value: 200 });
    expect(await workerB).toEqual({ status: "fulfilled", value: 1 });
    assertNoAbandonedLocks();
  }, 15_000);
});
