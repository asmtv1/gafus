import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";

vi.mock("@gafus/prisma", () => ({ prisma: {} }));

import { changeGafusBalanceTx } from "./walletService";

const state = {
  balance: 0,
  transactions: new Map<string, {
    id: string; userId: string; delta: number; kind: string;
    targetKey: string | null; balanceAfter: number;
  }>(),
};

function tx() {
  return {
    gafusWallet: {
      upsert: vi.fn(async () => ({ userId: "user-1", balance: state.balance })),
      updateMany: vi.fn(async ({ where, data }: {
        where: { balance?: { gte: number } };
        data: { balance: { increment?: number; decrement?: number } };
      }) => {
        if (where.balance && state.balance < where.balance.gte) return { count: 0 };
        state.balance += data.balance.increment ?? -(data.balance.decrement ?? 0);
        return { count: 1 };
      }),
    },
    gafusTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        state.transactions.get(where.idempotencyKey) ?? null),
      create: vi.fn(async ({ data }: { data: {
        userId: string; delta: number; kind: string; idempotencyKey: string;
        targetKey?: string; balanceAfter: number;
      } }) => {
        const row = { id: `tx-${state.transactions.size + 1}`,
          userId: data.userId, delta: data.delta, kind: data.kind,
          targetKey: data.targetKey ?? null, balanceAfter: data.balanceAfter };
        state.transactions.set(data.idempotencyKey, row);
        return row;
      }),
    },
  } as unknown as GafusTx;
}

describe("Gafus wallet invariants", () => {
  beforeEach(() => {
    state.balance = 0;
    state.transactions.clear();
  });

  it("refuses signed-kind inconsistencies and DB integer overflow", async () => {
    const client = tx();
    await expect(changeGafusBalanceTx(client, {
      userId: "user-1", amount: -1, kind: "EARN", idempotencyKey: "bad-earn",
    })).rejects.toMatchObject({ code: "GAFUS_INVALID_AMOUNT" });
    await expect(changeGafusBalanceTx(client, {
      userId: "user-1", amount: 1, kind: "ADMIN_DEBIT", idempotencyKey: "bad-debit",
    })).rejects.toMatchObject({ code: "GAFUS_INVALID_AMOUNT" });
    await expect(changeGafusBalanceTx(client, {
      userId: "user-1", amount: 2_147_483_648, kind: "ADMIN_CREDIT",
      idempotencyKey: "overflow",
    })).rejects.toMatchObject({ code: "GAFUS_INVALID_AMOUNT" });
    expect(state.transactions.size).toBe(0);
  });

  it("replays a matching request without double-crediting and rejects key reuse", async () => {
    const client = tx();
    const data = { userId: "user-1", amount: 2, kind: "EARN" as const,
      idempotencyKey: "unique-activity" };
    const first = await changeGafusBalanceTx(client, data);
    expect(first).toMatchObject({ replay: false, balance: 2 });
    const replay = await changeGafusBalanceTx(client, data);
    expect(replay).toMatchObject({ replay: true, transactionId: first.transactionId });
    expect(state.balance).toBe(2);
    await expect(changeGafusBalanceTx(client, {
      ...data, amount: 3,
    })).rejects.toMatchObject({ code: "GAFUS_IDEMPOTENCY_CONFLICT" });
  });

  it("rejects overspending without modifying the wallet or ledger", async () => {
    const client = tx();
    await changeGafusBalanceTx(client, {
      userId: "user-1", amount: 1, kind: "EARN", idempotencyKey: "seed",
    });
    await expect(changeGafusBalanceTx(client, {
      userId: "user-1", amount: -2, kind: "SPEND", idempotencyKey: "bad-spend",
    })).rejects.toMatchObject({ code: "GAFUS_INSUFFICIENT_BALANCE" });
    expect(state.balance).toBe(1);
    expect(state.transactions.size).toBe(1);
  });

  it("prevents the final balance crossing PostgreSQL INT capacity", async () => {
    const client = tx();
    state.balance = 2_147_483_646;
    await expect(changeGafusBalanceTx(client, {
      userId: "user-1", amount: 2, kind: "ADMIN_CREDIT", idempotencyKey: "too-much",
    })).rejects.toMatchObject({ code: "GAFUS_INVALID_AMOUNT" });
    expect(state.balance).toBe(2_147_483_646);
  });
});
