import { describe, expect, it } from "vitest";
import type { GafusTx } from "./types";
import { awardActivityTx, awardBonusTx } from "./rewardService";
import { DEFAULT_GAFUS_SETTINGS } from "./settingsService";

type TestEvent = {
  id: string; eventKey: string; userId: string; rewardKind: string;
  sourceEntityId: string; rewardClass: string; decision: string;
  amount: number; occurredAt: Date; contentFingerprint?: string | null;
  transactionId?: string | null;
};

function memoryTransaction() {
  const events = new Map<string, TestEvent>();
  const transactions = new Map<string, {
    id: string; userId: string; delta: number; kind: string;
    balanceAfter: number; targetKey: string | null;
  }>();
  let balance = 0;
  let createdWallet = false;
  const settings = {
    ...DEFAULT_GAFUS_SETTINGS,
    economyEnabled: true,
    earningEnabled: true,
    spendingEnabled: true,
  };

  const tx = {
    $queryRaw: async () => [{ pg_advisory_xact_lock: null }],
    gafusNotificationOutbox: { upsert: async () => ({}) },
    gafusSettings: { findUnique: async () => settings },
    gafusWallet: {
      findUnique: async () => createdWallet ? { balance } : null,
      upsert: async () => {
        createdWallet = true;
        return { balance };
      },
      updateMany: async ({ where, data }: {
        where: { balance?: { gte: number } };
        data: { balance: { increment?: number; decrement?: number } };
      }) => {
        if (where.balance && balance < where.balance.gte) return { count: 0 };
        balance += (data.balance.increment ?? 0) - (data.balance.decrement ?? 0);
        return { count: 1 };
      },
    },
    gafusTransaction: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        transactions.get(where.idempotencyKey) ?? null,
      create: async ({ data }: { data: {
        idempotencyKey: string; userId: string; delta: number;
        kind: string; balanceAfter: number; targetKey?: string | null;
      } }) => {
        const row = { ...data, id: `tx-${transactions.size + 1}`, targetKey: data.targetKey ?? null };
        transactions.set(data.idempotencyKey, row);
        return row;
      },
    },
    gafusRewardEvent: {
      findUnique: async ({ where }: { where: { eventKey: string } }) =>
        events.get(where.eventKey) ?? null,
      findFirst: async ({ where }: {
        where: { userId: string; contentFingerprint: string; occurredAt: { gte: Date; lte: Date } };
      }) => [...events.values()].find((e) =>
        e.userId === where.userId && e.contentFingerprint === where.contentFingerprint
        && e.occurredAt >= where.occurredAt.gte && e.occurredAt <= where.occurredAt.lte) ?? null,
      aggregate: async ({ where }: {
        where: { userId: string; rewardClass: string; decision: string;
          occurredAt: { gt: Date; lte: Date } };
      }) => ({
        _sum: { amount: [...events.values()].filter((e) =>
          e.userId === where.userId && e.rewardClass === where.rewardClass
          && e.decision === where.decision && e.occurredAt > where.occurredAt.gt
          && e.occurredAt <= where.occurredAt.lte,
        ).reduce((sum, e) => sum + e.amount, 0) },
      }),
      create: async ({ data }: { data: Omit<TestEvent, "id"> }) => {
        const row = { ...data, id: `event-${events.size + 1}` };
        events.set(data.eventKey, row);
        return row;
      },
    },
  };
  return { tx: tx as unknown as GafusTx, events, transactions, balance: () => balance };
}

describe("Gafus activity economy (transaction-local behavior)", () => {
  const origin = new Date("2026-10-10T10:00:00.000Z");
  const post = (n: number, occurredAt = new Date(origin.getTime() + n * 60_000)) => ({
    userId: "user-one",
    kind: "POST_PUBLISHED" as const,
    eventKey: `activity:post:${n}`,
    sourceEntityId: String(n),
    occurredAt,
    content: [
      "Подробная история прогулки с собакой по осеннему лесу",
      "Советы по обучению команде рядом в городском парке",
      "Наш опыт знакомства щенка с другими спокойными животными",
      "Почему собака лучше слушается после интересных домашних игр",
      "Заметки о правильном уходе за лапами после зимних прогулок",
    ][n],
  });

  it("enforces three grants in 24h and permanently records the fourth denial", async () => {
    const db = memoryTransaction();
    for (let i = 0; i < 3; i++) {
      const result = await awardActivityTx(db.tx, post(i));
      expect(result.decision).toBe("GRANTED");
      expect(result.amount).toBe(1);
    }
    const denied = await awardActivityTx(db.tx, post(3));
    expect(denied.decision).toBe("DENIED_ACTIVITY_LIMIT");
    expect(db.balance()).toBe(3);

    const later = new Date(origin.getTime() + 25 * 60 * 60 * 1000);
    const replay = await awardActivityTx(db.tx, post(3, later));
    expect(replay.decision).toBe("DENIED_ACTIVITY_LIMIT");
    expect(replay.replay).toBe(true);
    expect(db.balance()).toBe(3);

    const next = await awardActivityTx(db.tx, post(4, later));
    expect(next.decision).toBe("GRANTED");
    expect(db.balance()).toBe(4);
    expect(db.transactions.size).toBe(4);
    expect(db.events.size).toBe(5);
  });

  it("grants best-answer bonus outside the activity limit, only once", async () => {
    const db = memoryTransaction();
    for (let i = 0; i < 3; i++) await awardActivityTx(db.tx, post(i));
    const input = {
      userId: "user-one", kind: "BEST_ANSWER" as const,
      eventKey: "bonus:best-answer:a1", sourceEntityId: "a1",
      occurredAt: new Date(origin.getTime() + 5 * 60_000),
    };
    expect((await awardBonusTx(db.tx, input)).amount).toBe(1);
    expect((await awardBonusTx(db.tx, input)).replay).toBe(true);
    expect(db.balance()).toBe(4);
    expect(db.transactions.size).toBe(4);
  });
});
