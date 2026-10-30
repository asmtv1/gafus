/** AG1 source-only mock. No PostgreSQL/Redis/cron/providers or worker activation. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = {
    ownerUserId: string; operationKey: string; operationKind: string;
    fingerprint: string; state: string; reminderId: string | null;
    responseJson: unknown; expiresAt: Date; createdAt: Date;
  };
  return {
    receipts: new Map<string, Row>(),
    reminders: new Map<string, { id: string; userId: string; type: string }>(),
    now: new Date(),
    blockedKeys: new Set<string>(),
    serial: Promise.resolve() as Promise<void>,
    executed: 0,
    txCalls: 0,
    SQL: [] as string[],
    fault: "" as "" | "query" | "invalid-count" | "commit",
  };
});

const ZEROS = "0".repeat(64);
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rowId = (owner: string, operationKey: string) => `${owner}:${operationKey}`;

vi.mock("@gafus/prisma", () => ({
  isPrismaUniqueConstraintError: () => false,
  prisma: {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      db.txCalls++;
      let release!: () => void;
      const prior = db.serial;
      db.serial = new Promise<void>((done) => { release = done; });
      await prior;
      const rows = new Map([...db.receipts.entries()].map(([k, v]) => [k, { ...v }]));
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...vars: unknown[]) => {
          const sql = parts.join("?PARAM?");
          db.SQL.push(sql);
          if (sql.includes("WITH expired AS MATERIALIZED")) {
            db.executed++;
            if (db.fault === "query") throw new Error("MOCK_QUERY_FAILED_NO_PRIVATE_DETAILS");
            expect(vars).toEqual([ZEROS, expect.any(Number), ZEROS]);
            const limit = vars[1] as number;
            const selected = [...rows.values()]
              .filter((r) => r.expiresAt.getTime() <= db.now.getTime() &&
                (r.responseJson !== null || r.reminderId !== null ||
                 r.fingerprint !== ZEROS || r.state !== "EXPIRED") &&
                !db.blockedKeys.has(rowId(r.ownerUserId, r.operationKey)))
              .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() ||
                a.ownerUserId.localeCompare(b.ownerUserId) ||
                a.operationKey.localeCompare(b.operationKey))
              .slice(0, limit);
            for (const r of selected) {
              r.responseJson = null;
              r.reminderId = null;
              r.fingerprint = ZEROS;
              r.state = "EXPIRED";
            }
            if (db.fault === "invalid-count") return [{ affectedCount: limit + 1 }];
            return [{ affectedCount: selected.length }];
          }
          if (sql.includes('SELECT "id" FROM "User"')) return [{ id: vars[0] }];
          if (sql.includes('FROM "ReminderMutationReceipt"')) {
            const found = rows.get(rowId(String(vars[0]), String(vars[1])));
            return found ? [found] : [];
          }
          throw new Error("MOCK_UNKNOWN_SQL_SHAPE");
        },
        reminder: {
          findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
            const item = db.reminders.get(where.id);
            return item?.userId === where.userId ? { id: where.id } : null;
          },
          count: async () => { throw new Error("CREATE_REPLAY_MUST_NOT_COUNT_REMINDERS"); },
          create: async () => { throw new Error("CREATE_REPLAY_MUST_NOT_CREATE_REMINDERS"); },
        },
        $executeRaw: async () => { throw new Error("CREATE_REPLAY_MUST_NOT_INSERT_OR_UPDATE_RECEIPT"); },
      };
      try {
        const result = await fn(tx);
        if (db.fault === "commit") throw new Error("MOCK_COMMIT_FAILED_NO_PRIVATE_DETAILS");
        db.receipts = rows;
        return result;
      } finally { release(); }
    },
    $queryRaw: async (_parts: TemplateStringsArray, ...vars: unknown[]) => {
      const found = db.receipts.get(rowId(String(vars[0]), String(vars[1])));
      return found ? [found] : [];
    },
    reminder: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const item = db.reminders.get(where.id);
        return item?.userId === where.userId ? { id: where.id } : null;
      },
    },
  },
}));

import { redactExpiredReminderReceiptPII } from "./g1ReminderExpiryPIIRedaction.review";
import { createReminderAG4, lookupReminderAG4, ReminderUnknownError } from "./g1ReminderMutationReceiptAG4.review";

function seed(n: number, options: {
  owner?: string; expired?: boolean; atExpiry?: boolean;
  state?: string; pii?: boolean; fingerprint?: string;
} = {}) {
  const ownerUserId = options.owner ?? "owner-A";
  const operationKey = key(n);
  const expiresAt = options.atExpiry ? new Date(db.now) :
    new Date(db.now.getTime() + (options.expired === false ? 60_000 : -60_000));
  const reminderId = options.pii === false ? null : `reminder-${n}`;
  const item = {
    ownerUserId, operationKey, operationKind: "CREATE",
    fingerprint: options.fingerprint ?? "a".repeat(64), state: options.state ?? "COMMITTED",
    reminderId, responseJson: options.pii === false ? null :
      { id: reminderId, name: `PRIVATE_NAME_${n}`, timezone: "Europe/Moscow" },
    expiresAt, createdAt: new Date(db.now.getTime() - 10_000_000),
  };
  db.receipts.set(rowId(ownerUserId, operationKey), item);
  if (reminderId) db.reminders.set(reminderId, { id: reminderId, userId: ownerUserId, type: "training" });
  return item;
}

beforeEach(() => {
  db.receipts.clear(); db.reminders.clear(); db.blockedKeys.clear(); db.SQL.length = 0;
  db.now = new Date(); db.serial = Promise.resolve(); db.executed = 0; db.txCalls = 0; db.fault = "";
});

describe("AG1 expired receipt PII redaction source/mock contract", () => {
  it("E01 expired COMMITTED: response/reminder NULL, 64 zero fingerprint, EXPIRED and count only", async () => {
    const before = seed(1);
    const id = rowId(before.ownerUserId, before.operationKey);
    const immutable = { ownerUserId: before.ownerUserId, operationKey: before.operationKey,
      operationKind: before.operationKind,
      expiresAt: before.expiresAt, createdAt: before.createdAt,
    };
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    const after = db.receipts.get(id)!;
    expect(after).toMatchObject({ ...immutable, state: "EXPIRED", fingerprint: ZEROS,
      responseJson: null, reminderId: null });
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(db.reminders.size).toBe(1); // PII redaction must never delete actual reminders.
  });

  it("E02 expired PENDING also becomes spent EXPIRED tombstone", async () => {
    const r = seed(2, { state: "PENDING", pii: false });
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toMatchObject({
      state: "EXPIRED", fingerprint: ZEROS, responseJson: null, reminderId: null,
    });
  });

  it("E03 unexpired COMMITTED active receipt is byte-for-byte unchanged", async () => {
    const r = seed(3, { expired: false });
    const original = structuredClone(r);
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toEqual(original);
  });

  it("E04 expiresAt exactly database CURRENT_TIMESTAMP is eligible", async () => {
    const r = seed(4, { atExpiry: true });
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))?.state).toBe("EXPIRED");
  });

  it("E05 batch 200 maximum; 201st remains untouched until next transaction", async () => {
    for (let i = 1; i <= 201; i++) seed(i);
    expect(await redactExpiredReminderReceiptPII()).toBe(200);
    expect([...db.receipts.values()].filter(r => r.state === "EXPIRED")).toHaveLength(200);
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect([...db.receipts.values()].filter(r => r.state === "EXPIRED")).toHaveLength(201);
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    expect(db.executed).toBe(3);
  });

  it("E06 custom batch 1; numeric limits 0, 201, noninteger, NaN reject before DB", async () => {
    seed(6); seed(7);
    for (const n of [0, 201, -1, 1.4, Infinity, NaN]) {
      await expect(redactExpiredReminderReceiptPII(n)).rejects.toBeInstanceOf(RangeError);
    }
    expect(db.txCalls).toBe(0);
    expect(await redactExpiredReminderReceiptPII(1)).toBe(1);
    expect([...db.receipts.values()].filter(r => r.state === "EXPIRED")).toHaveLength(1);
  });

  it("E07 repeat batch already-redacted rows is idempotent and does not mutate tombstone", async () => {
    const r = seed(8);
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    const version = structuredClone(db.receipts.get(rowId(r.ownerUserId, r.operationKey)));
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toEqual(version);
  });

  it("E08 expired rows already response NULL but reminderId and fingerprint remain are scrubbed", async () => {
    const r = seed(9);
    r.responseJson = null;
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toMatchObject({
      responseJson: null, reminderId: null, state: "EXPIRED", fingerprint: ZEROS,
    });
  });

  it("E09 already EXPIRED but private response remains must still be scrubbed", async () => {
    const r = seed(10, { state: "EXPIRED" });
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))?.responseJson).toBeNull();
  });

  it("E10 serialized Promise.all mock prevents duplicate processing (NOT real PostgreSQL concurrency proof)", async () => {
    for (let i = 11; i <= 35; i++) seed(i);
    const [a, b] = await Promise.all([
      redactExpiredReminderReceiptPII(), redactExpiredReminderReceiptPII(),
    ]);
    expect([a, b].sort((x,y) => x-y)).toEqual([0, 25]);
    expect(db.receipts.size).toBe(25);
  });

  it("E11 SKIP LOCKED locked rows are left intact and picked by next batch", async () => {
    const locked = seed(36); seed(37);
    db.blockedKeys.add(rowId(locked.ownerUserId, locked.operationKey));
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    const lockedRow = db.receipts.get(rowId(locked.ownerUserId, locked.operationKey));
    expect(lockedRow?.responseJson).not.toBeNull();
    db.blockedKeys.clear();
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
  });

  it("E12 mock query failure rolls back all changes atomically", async () => {
    const r = seed(38); const before = structuredClone(r);
    db.fault = "query";
    await expect(redactExpiredReminderReceiptPII()).rejects.toThrow("MOCK_QUERY_FAILED_NO_PRIVATE_DETAILS");
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toEqual(before);
  });

  it("E13 invalid affected count fails closed and rolls transaction back", async () => {
    const r = seed(39); const before = structuredClone(r);
    db.fault = "invalid-count";
    await expect(redactExpiredReminderReceiptPII()).rejects.toThrow("REMINDER_EXPIRY_REDACTION_UNKNOWN");
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toEqual(before);
  });

  it("E14 mock transaction commit failure leaves rows intact", async () => {
    const r = seed(40); const before = structuredClone(r);
    db.fault = "commit";
    await expect(redactExpiredReminderReceiptPII()).rejects.toThrow("MOCK_COMMIT_FAILED_NO_PRIVATE_DETAILS");
    expect(db.receipts.get(rowId(r.ownerUserId, r.operationKey))).toEqual(before);
  });

  it("E15 expired tombstone key must fail replay same and different payload and not create again", async () => {
    const r = seed(41);
    const reminderCount = db.reminders.size;
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    const input = { name: "Original", reminderTime: "09:00" };
    await expect(createReminderAG4(r.ownerUserId, input, r.operationKey))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    await expect(createReminderAG4(r.ownerUserId, { ...input, name: "DIFFERENT" }, r.operationKey))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    expect(db.reminders.size).toBe(reminderCount);
    expect(db.receipts.size).toBe(1);
  });

  it("E16 expired lookup yields indistinguishable UNKNOWN for owner, foreign and absent", async () => {
    const r = seed(42);
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    for (const [owner, lookup] of [
      [r.ownerUserId, r.operationKey], ["foreign", r.operationKey], [r.ownerUserId, key(999)],
    ]) {
      await expect(lookupReminderAG4(owner, lookup)).rejects.toBeInstanceOf(ReminderUnknownError);
    }
  });

  it("E17 active COMMITTED receipt remains readable before redaction window", async () => {
    const r = seed(43, { expired: false });
    expect(await redactExpiredReminderReceiptPII()).toBe(0);
    const readback = await lookupReminderAG4(r.ownerUserId, r.operationKey);
    expect(readback.status).toBe("COMMITTED");
    expect(readback.reminder.id).toBe(r.reminderId);
  });

  it("E18 same owner/key across sessions A→B→A stays spent after expiry", async () => {
    const r = seed(44);
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    await expect(lookupReminderAG4("other-owner", r.operationKey))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    await expect(createReminderAG4(r.ownerUserId, { name: "Return A", reminderTime: "09:00" }, r.operationKey))
      .rejects.toBeInstanceOf(ReminderUnknownError);
  });

  it("E19 SQL shape: one atomic CTE, db clock, row limit, skip locked, no DELETE and no key RETURNING", async () => {
    seed(45);
    expect(await redactExpiredReminderReceiptPII()).toBe(1);
    expect(db.SQL).toHaveLength(1);
    const sql = db.SQL[0];
    expect(sql).toContain("WITH expired AS MATERIALIZED");
    expect(sql).toContain("CURRENT_TIMESTAMP");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("LIMIT ?PARAM?");
    expect(sql).toContain('"ownerUserId" = expired."ownerUserId"');
    expect(sql).toContain('"operationKey" = expired."operationKey"');
    expect(sql).toContain('"responseJson" = NULL');
    expect(sql).toContain('"reminderId" = NULL');
    expect(sql).toContain('"fingerprint" = ?PARAM?');
    expect(sql).toContain('"state" = \'EXPIRED\'');
    expect(sql).toContain("RETURNING 1");
    expect(sql).toContain('COUNT(*)::integer AS "affectedCount"');
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
    expect(sql).not.toContain('RETURNING "ownerUserId"');
    expect(sql).not.toContain('RETURNING "operationKey"');
  });

  it("E20 privacy: no logs; only numeric output, never raw PII/owner/key/reminderId", async () => {
    seed(46);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await redactExpiredReminderReceiptPII();
      expect(result).toBe(1);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("PRIVATE_NAME");
      expect(JSON.stringify(result)).not.toContain("owner-A");
    } finally { log.mockRestore(); error.mockRestore(); }
  });
});
