/** AG4 2026-10-18 candidate: transactional mock, NEVER actual PG SQL proof. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  reminders: new Map<string, { id: string; userId: string; type: string; name: string }>(),
  receipts: new Map<string, { operationKind: string; fingerprint: string;
    state: string; responseJson: unknown;
    reminderId: string | null; expiresAt: Date }>(),
  created: 0, serial: Promise.resolve() as Promise<void>,
  fault: "" as "" | "update" | "insert" | "ack" | "create" | "unique",
}));
vi.mock("@gafus/prisma", () => ({
  isPrismaUniqueConstraintError: (error: unknown) =>
    !!error && typeof error === "object" && "code" in error && error.code === "P2002",
  prisma: {
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const prior = db.serial;
      db.serial = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      const reminders = new Map(db.reminders), receipts = new Map(db.receipts);
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...vars: unknown[]) => {
          if (String(parts[0]).includes('SELECT "id" FROM "User"')) {
            return [{ id: vars[0] }];
          }
          const row = receipts.get(`${vars[0]}:${vars[1]}`);
          return row ? [row] : [];
        },
        reminder: {
          count: async ({ where }: { where: { userId: string } }) =>
            [...reminders.values()].filter((r) => r.userId === where.userId).length,
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            reminders.get(where.id)?.userId === where.userId ? { id: where.id } : null,
          create: async ({ data }: { data: { userId: string; type: string; name: string } }) => {
            if (db.fault === "create") throw new Error("DB_CREATE_FAULT");
            const record = { id: `reminder-${++db.created}`, ...data };
            reminders.set(record.id, record);
            return record;
          },
        },
        $executeRaw: async (parts: TemplateStringsArray, ...vars: unknown[]) => {
          if (String(parts[0]).includes('INSERT INTO "ReminderMutationReceipt"')) {
            if (db.fault === "insert") throw new Error("DB_RECEIPT_INSERT_FAULT");
            if (db.fault === "unique") {
              throw Object.assign(new Error("DUPLICATE"), { code: "P2002" });
            }
            receipts.set(`${vars[0]}:${vars[1]}`, {
              operationKind: "CREATE", fingerprint: String(vars[2]),
              state: "PENDING", responseJson: null, reminderId: null,
              expiresAt: vars[3] as Date });
            return 1;
          }
          if (db.fault === "update") throw new Error("DB_RECEIPT_UPDATE_FAULT");
          const receipt = receipts.get(`${vars[2]}:${vars[3]}`)!;
          receipt.state = "COMMITTED";
          receipt.reminderId = String(vars[0]);
          receipt.responseJson = JSON.parse(String(vars[1])) as unknown;
          return 1;
        },
      };
      try {
        const value = await cb(tx);
        db.reminders = reminders;
        db.receipts = receipts;
        if (db.fault === "ack") throw new Error("ACK_LOST_AFTER_REAL_COMMIT_MOCK");
        return value;
      } finally { release(); }
    },
    $queryRaw: async (_parts: TemplateStringsArray, ...vars: unknown[]) => {
      const row = db.receipts.get(`${vars[0]}:${vars[1]}`);
      return row ? [row] : [];
    },
    reminder: { findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
      db.reminders.get(where.id)?.userId === where.userId ? { id: where.id } : null },
  },
}));
import {
  createReminderAG4, lookupReminderAG4, fingerprintDraft,
  normalizeDraft, validateKey, ReminderConflictError, ReminderUnknownError,
  ReminderInvalidError, ReminderCapError,
 } from "./g1ReminderMutationReceiptAG4.review";
import { createReminder } from "./reminderService";
const key = (id: number) => `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`;
const input = { name: " Walk ", reminderTime: "09:00", reminderDays: "3,1,1" };
beforeEach(() => {
  db.reminders.clear(); db.receipts.clear(); db.created = 0;
  db.serial = Promise.resolve(); db.fault = "";
});
describe("AG4 owner receipt/expiry/revocation design review, mock transaction", () => {
  it("A01 trim name, canonical days and default timezone fingerprint", () => {
    expect(normalizeDraft(input)).toEqual({ name: "Walk", reminderTime: "09:00",
      reminderDays: "1,3", timezone: "Europe/Moscow" });
    expect(fingerprintDraft(input)).toBe(fingerprintDraft({
      ...input, name: "Walk", reminderDays: "1,3", timezone: "Europe/Moscow",
    }));
    expect(fingerprintDraft({ ...input, name: "Other" })).not.toBe(fingerprintDraft(input));
  });
  it("A02 keyed create, replay identical id and payload, no duplicate", async () => {
    const a = await createReminderAG4("A", input, key(2));
    const b = await createReminderAG4("A", { ...input, name: "Walk" }, key(2));
    expect([a.kind, b.kind]).toEqual(["created", "idempotent_replay"]);
    expect(b.reminder).toEqual(a.reminder);
    expect(db.reminders.size).toBe(1);
    expect(db.receipts.size).toBe(1);
  });
  it("A03 conflicting content same owner/key 409, original untouched", async () => {
    await createReminderAG4("A", input, key(3));
    await expect(createReminderAG4("A", { ...input, name: "Changed" }, key(3)))
      .rejects.toBeInstanceOf(ReminderConflictError);
    expect(db.reminders.size).toBe(1);
  });
  it("A04 same UUID across owners is isolated, foreign readback UNKNOWN", async () => {
    const a = await createReminderAG4("A", input, key(4));
    const b = await createReminderAG4("B", input, key(4));
    expect(a.reminder.id).not.toBe(b.reminder.id);
    expect((await lookupReminderAG4("A", key(4))).reminder.id).toBe(a.reminder.id);
    expect((await lookupReminderAG4("B", key(4))).reminder.id).toBe(b.reminder.id);
    await expect(lookupReminderAG4("C", key(4)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
  });
  it("A05 COMMIT then lost ACK/restart: GET owner reads receipt, no POST required", async () => {
    db.fault = "ack";
    await expect(createReminderAG4("A", input, key(5)))
      .rejects.toThrow("ACK_LOST_AFTER_REAL_COMMIT_MOCK");
    db.fault = "";
    expect((await lookupReminderAG4("A", key(5))).status).toBe("COMMITTED");
    expect((await createReminderAG4("A", input, key(5))).kind).toBe("idempotent_replay");
    expect(db.reminders.size).toBe(1);
  });
  it("A06 error at receipt UPDATE after reminder INSERT rolls back both", async () => {
    db.fault = "update";
    await expect(createReminderAG4("A", input, key(6)))
      .rejects.toThrow("DB_RECEIPT_UPDATE_FAULT");
    expect(db.reminders.size).toBe(0);
    expect(db.receipts.size).toBe(0);
  });
  it("A07 fail in receipt INSERT or reminder INSERT leaves zero records", async () => {
    db.fault = "insert";
    await expect(createReminderAG4("A", input, key(7)))
      .rejects.toThrow("DB_RECEIPT_INSERT_FAULT");
    db.fault = "create";
    await expect(createReminderAG4("A", input, key(7)))
      .rejects.toThrow("DB_CREATE_FAULT");
    expect(db.reminders.size).toBe(0);
    expect(db.receipts.size).toBe(0);
  });
  it("A08 12 concurrent same owner/key yield single Reminder+receipt", async () => {
    const outcomes = await Promise.all(Array.from({ length: 12 }, () =>
      createReminderAG4("A", input, key(8))));
    expect(outcomes.filter((x) => x.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((x) => x.kind === "idempotent_replay")).toHaveLength(11);
    expect(db.reminders.size).toBe(1);
  });
  it("A09 concurrent distinct keys enforce cap five; replays before count", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) =>
      createReminderAG4("A", input, key(20 + i))));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(3);
    expect((results.filter((x) => x.status === "rejected") as PromiseRejectedResult[])
      .every((x) => x.reason instanceof ReminderCapError)).toBe(true);
    expect(db.reminders.size).toBe(5);
    expect((await createReminderAG4("A", input, key(20))).kind).toBe("idempotent_replay");
  });
  it("A10 expired receipt retains tombstone, cannot recreate even with same key", async () => {
    await createReminderAG4("A", input, key(10));
    db.receipts.get(`A:${key(10)}`)!.expiresAt = new Date(Date.now() - 1000);
    await expect(lookupReminderAG4("A", key(10)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    await expect(createReminderAG4("A", input, key(10)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    expect(db.reminders.size).toBe(1);
  });
  it("A11 reminder deleted, receipt remains tombstone and never resurrects", async () => {
    const saved = await createReminderAG4("A", input, key(11));
    db.reminders.delete(saved.reminder.id);
    await expect(lookupReminderAG4("A", key(11)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    await expect(createReminderAG4("A", input, key(11)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    expect(db.reminders.size).toBe(0);
    expect(db.receipts.size).toBe(1);
  });
  it("A12 duplicate key P2002 becomes UNKNOWN 409 domain, no leaked ORM error", async () => {
    db.fault = "unique";
    await expect(createReminderAG4("A", input, key(12)))
      .rejects.toBeInstanceOf(ReminderUnknownError);
    expect(db.reminders.size).toBe(0);
    expect(db.receipts.size).toBe(0);
  });
  it("A13 same UUID different operation kind cannot replay CREATE", async () => {
    await createReminderAG4("A", input, key(13));
    db.receipts.get(`A:${key(13)}`)!.operationKind = "DELETE";
    await expect(createReminderAG4("A", input, key(13)))
      .rejects.toBeInstanceOf(ReminderConflictError);
    expect(db.reminders.size).toBe(1);
  });
  it("A14 four existing + concurrent keyed/keyless => one winner, max five", async () => {
    for (let n = 1; n <= 4; n++) await createReminderAG4("A", input, key(70 + n));
    const results = await Promise.allSettled([
      createReminderAG4("A", { ...input, name: "Fifth keyed" }, key(77)),
      createReminder("A", "Fifth legacy", "10:00", null, "Europe/Moscow"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(db.reminders.size).toBe(5);
    expect(db.receipts.size).toBeGreaterThanOrEqual(4);
    expect(db.receipts.size).toBeLessThanOrEqual(5);
  });
  it("A15 four existing + two simultaneous keyless => one success, max five", async () => {
    for (let n = 1; n <= 4; n++) await createReminderAG4("A", input, key(80 + n));
    const results = await Promise.allSettled([
      createReminder("A", "Legacy fifth", "10:00"),
      createReminder("A", "Legacy sixth", "11:00"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(db.reminders.size).toBe(5);
    expect(db.receipts.size).toBe(4);
  });
  it("A16 legacy keyless leaves zero receipt and original data format", async () => {
    const result = await createReminder("A", "Legacy", "08:00", undefined, undefined);
    expect(result.id).toBe("reminder-1");
    expect(db.reminders.size).toBe(1);
    expect(db.receipts.size).toBe(0);
  });
  it("A17 invalid UUID/client data fails without any receipt mutation", async () => {
    expect(() => validateKey("uuid-v1")).toThrow(ReminderInvalidError);
    await expect(createReminderAG4("A", { ...input, name: "   " }, key(12)))
      .rejects.toBeInstanceOf(ReminderInvalidError);
    await expect(createReminderAG4("A", { ...input, timezone: "BAD/TZ" }, key(12)))
      .rejects.toBeInstanceOf(ReminderInvalidError);
    expect(db.receipts.size).toBe(0);
  });
});
