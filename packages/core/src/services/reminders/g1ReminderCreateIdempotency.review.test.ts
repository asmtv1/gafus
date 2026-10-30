/** Review-source model: transactional DB mock, NOT actual PostgreSQL SQL proof. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reminders: new Map<string, { id: string; userId: string; type: string; name: string;
    reminderTime: string; reminderDays: string | null; timezone: string; enabled: boolean;
    createdAt: Date }>(),
  receipts: new Map<string, { fingerprint: string; responseJson: unknown }>(),
  created: 0,
  sequence: 0,
  serial: Promise.resolve() as Promise<void>,
  errorAt: "" as "" | "create" | "receipt" | "postcommit",
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const prior = state.serial;
      state.serial = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      const nextReminders = new Map(state.reminders);
      const nextReceipts = new Map(state.receipts);
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
          if (String(parts[0]).includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
          return nextReceipts.has(`${values[0]}:${values[1]}`)
            ? [nextReceipts.get(`${values[0]}:${values[1]}`)] : [];
        },
        reminder: {
          count: async ({ where }: { where: { userId: string; type: string } }) =>
            [...nextReminders.values()].filter((r) =>
              r.userId === where.userId && r.type === where.type).length,
          create: async ({ data }: { data: {
            userId: string; type: string; name: string; reminderTime: string;
            reminderDays: string | null; timezone: string; enabled: boolean;
          } }) => {
            if (state.errorAt === "create") throw new Error("SYNTHETIC_CREATE_SQL_FAULT");
            const result = { id: `rem-${++state.sequence}`, ...data, createdAt: new Date("2026-10-18T00:00:00Z") };
            nextReminders.set(result.id, result);
            state.created++;
            return result;
          },
        },
        $executeRaw: async (_parts: TemplateStringsArray, ...values: unknown[]) => {
          if (state.errorAt === "receipt") throw new Error("SYNTHETIC_RECEIPT_SQL_FAULT");
          nextReceipts.set(`${values[0]}:${values[1]}`, {
            fingerprint: String(values[2]), responseJson: JSON.parse(String(values[4])) as unknown,
          });
          return 1;
        },
      };
      try {
        const output = await cb(tx);
        state.reminders = nextReminders;
        state.receipts = nextReceipts;
        if (state.errorAt === "postcommit") throw new Error("AG1_SYNTHETIC_LOST_ACK_AFTER_COMMIT");
        return output;
      } finally { release(); }
    },
    $queryRaw: async (_parts: TemplateStringsArray, ...values: unknown[]) => {
      const receipt = state.receipts.get(`${values[0]}:${values[1]}`);
      return receipt ? [{ responseJson: receipt.responseJson }] : [];
    },
  },
}));

import {
  assertReminderCreateKey, canonicalReminderDraft, createReminderWithReceipt,
  lookupOwnReminderCreateReceipt, reminderPayloadFingerprint,
  ReminderIdempotencyConflictError, ReminderIdempotencyInvalidError, ReminderLimitError,
} from "./g1ReminderCreateIdempotency.review";
const key = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const draft = { name: "Walk", reminderTime: "09:15", reminderDays: "3,1,1", timezone: "Europe/Moscow" };

beforeEach(() => {
  state.reminders.clear(); state.receipts.clear(); state.created = 0; state.sequence = 0;
  state.serial = Promise.resolve(); state.errorAt = "";
});

describe("AG1 reminder idempotent POST review contract (transaction/mock only)", () => {
  it("R01 canonical fingerprint same for equivalent days/default timezone, not name change", () => {
    expect(canonicalReminderDraft(draft).reminderDays).toBe("1,3");
    expect(reminderPayloadFingerprint(draft)).toBe(reminderPayloadFingerprint({
      ...draft, reminderDays: "1,3",
    }));
    expect(reminderPayloadFingerprint({ ...draft, name: "Changed" }))
      .not.toBe(reminderPayloadFingerprint(draft));
    expect(reminderPayloadFingerprint({ ...draft, timezone: undefined }))
      .toBe(reminderPayloadFingerprint(draft));
  });

  it("R02 first create and same owner/key retry return identical wire snapshot without a second write", async () => {
    const first = await createReminderWithReceipt("owner-a", draft, key(1));
    const repeated = await createReminderWithReceipt("owner-a", { ...draft, reminderDays: "1,3" }, key(1));
    expect(first.kind).toBe("created");
    expect(repeated.kind).toBe("idempotent_replay");
    expect(repeated.reminder).toEqual(first.reminder);
    expect(state.reminders.size).toBe(1);
    expect(state.receipts.size).toBe(1);
  });

  it("R03 same key and changed payload => deterministic 409 domain, no write", async () => {
    await createReminderWithReceipt("owner-a", draft, key(2));
    await expect(createReminderWithReceipt("owner-a", { ...draft, name: "Another" }, key(2)))
      .rejects.toBeInstanceOf(ReminderIdempotencyConflictError);
    expect(state.reminders.size).toBe(1);
  });

  it("R04 two owners same UUID isolated, owner lookup cannot reveal another owner's receipt", async () => {
    const a = await createReminderWithReceipt("owner-a", draft, key(3));
    const b = await createReminderWithReceipt("owner-b", draft, key(3));
    expect(a.reminder.id).not.toBe(b.reminder.id);
    expect((await lookupOwnReminderCreateReceipt("owner-a", key(3))).state).toBe("FOUND");
    expect((await lookupOwnReminderCreateReceipt("owner-b", key(3))).state).toBe("FOUND");
    expect(await lookupOwnReminderCreateReceipt("owner-b", key(999))).toEqual({ state: "UNKNOWN" });
    expect(await lookupOwnReminderCreateReceipt("owner-c", key(3))).toEqual({ state: "UNKNOWN" });
  });

  it("R05 lost ACK after COMMIT and simulated process restart recover same receipt", async () => {
    state.errorAt = "postcommit";
    await expect(createReminderWithReceipt("owner-a", draft, key(5)))
      .rejects.toThrow("AG1_SYNTHETIC_LOST_ACK_AFTER_COMMIT");
    expect(state.reminders.size).toBe(1);
    expect(state.receipts.size).toBe(1);
    // Reinitialize module/request state only; DB maps represent persisted state.
    state.errorAt = "";
    const readback = await lookupOwnReminderCreateReceipt("owner-a", key(5));
    expect(readback.state).toBe("FOUND");
    const reply = await createReminderWithReceipt("owner-a", draft, key(5));
    expect(reply.kind).toBe("idempotent_replay");
    expect(state.reminders.size).toBe(1);
  });

  it("R06 failed INSERT receipt rolls back Reminder CREATE atomically", async () => {
    state.errorAt = "receipt";
    await expect(createReminderWithReceipt("owner-a", draft, key(6)))
      .rejects.toThrow("SYNTHETIC_RECEIPT_SQL_FAULT");
    expect(state.reminders.size).toBe(0);
    expect(state.receipts.size).toBe(0);
    state.errorAt = "";
    expect((await createReminderWithReceipt("owner-a", draft, key(6))).kind).toBe("created");
  });

  it("R07 failed Reminder CREATE cannot persist receipt", async () => {
    state.errorAt = "create";
    await expect(createReminderWithReceipt("owner-a", draft, key(7)))
      .rejects.toThrow("SYNTHETIC_CREATE_SQL_FAULT");
    expect(state.reminders.size).toBe(0);
    expect(state.receipts.size).toBe(0);
  });

  it("R08 12 concurrent same-owner requests only one create + receipt", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      createReminderWithReceipt("owner-a", draft, key(8))));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "idempotent_replay")).toHaveLength(11);
    expect(new Set(results.map((r) => r.reminder.id)).size).toBe(1);
    expect(state.reminders.size).toBe(1);
    expect(state.receipts.size).toBe(1);
  });

  it("R09 per-owner maximum five enforced atomically among 8 different keys", async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, i) =>
      createReminderWithReceipt("owner-a", draft, key(i + 20))));
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(3);
    expect(outcomes.filter((r) => r.status === "rejected")
      .every((r) => (r as PromiseRejectedResult).reason instanceof ReminderLimitError)).toBe(true);
    expect(state.reminders.size).toBe(5);
    expect(state.receipts.size).toBe(5);
  });

  it("R10 replay returns prior receipt even at max5; changed payload still conflicts", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      createReminderWithReceipt("owner-a", draft, key(i + 40))));
    const replay = await createReminderWithReceipt("owner-a", draft, key(40));
    expect(replay.kind).toBe("idempotent_replay");
    await expect(createReminderWithReceipt("owner-a", { ...draft, name: "Changed" }, key(40)))
      .rejects.toBeInstanceOf(ReminderIdempotencyConflictError);
  });

  it("R11 invalid UUID versions, payload, timezone rejected before SQL write", async () => {
    for (const invalid of ["random", "00000000-0000-1000-8000-000000000001", ""]) {
      expect(() => assertReminderCreateKey(invalid)).toThrow(ReminderIdempotencyInvalidError);
    }
    await expect(createReminderWithReceipt("owner-a", { ...draft, reminderTime: "28:15" }, key(1)))
      .rejects.toBeInstanceOf(ReminderIdempotencyInvalidError);
    await expect(createReminderWithReceipt("owner-a", { ...draft, timezone: "Bad/Tz" }, key(1)))
      .rejects.toBeInstanceOf(ReminderIdempotencyInvalidError);
    expect(state.reminders.size).toBe(0);
  });
});
