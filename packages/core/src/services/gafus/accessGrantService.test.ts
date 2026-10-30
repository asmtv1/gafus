import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  balance: 3,
  spent: 0,
  allowed: false,
  paidOrPrivate: false,
  isMiniGuide: false,
  settingsEnabled: true,
  transactions: new Map<string, Record<string, unknown>>(),
  access: new Map<string, { expiresAt: Date }>(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      gafusTransaction: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
          state.transactions.get(where.idempotencyKey) ?? null,
      },
      gafusTargetAccess: {
        create: async ({ data }: { data: {
          transactionId: string; expiresAt: Date; targetKey: string;
        } }) => {
          state.access.set(data.transactionId, { expiresAt: data.expiresAt });
          for (const row of state.transactions.values()) {
            if (row.id === data.transactionId) {
              row.targetAccess = { expiresAt: data.expiresAt };
            }
          }
          return data;
        },
      },
    }),
  },
}));
vi.mock("./locking", () => ({ lockGafusUser: vi.fn(async () => undefined) }));
vi.mock("../contentAccess", () => ({
  resolveCourseStepTargetTx: vi.fn(async (
    _tx: unknown, dayOnCourseId: string, stepOnDayId: string,
  ) => ({
    type: "COURSE_STEP", courseId: "course-1", dayOnCourseId, stepOnDayId,
    targetKey: `course-step:${dayOnCourseId}:${stepOnDayId}`,
    paidOrPrivate: state.paidOrPrivate, monetized: true, isDailyStep: false,
  })),
  resolveMiniGuideTargetTx: vi.fn(async (_tx: unknown, courseId: string) =>
    state.isMiniGuide ? ({
      type: "MINI_GUIDE", courseId, targetKey: `mini-guide:${courseId}`,
      paidOrPrivate: state.paidOrPrivate,
    }) : null),
  resolveArticleTargetTx: vi.fn(async (_tx: unknown, articleId: string) => ({
    type: "ARTICLE", articleId, targetKey: `article:${articleId}`,
  })),
  resolveCourseStepAccessTx: vi.fn(async () => ({
    allowed: state.allowed, source: state.allowed ? "PREMIUM" : "DENIED",
    expiresAt: null, eligibleForGafus: !state.paidOrPrivate,
  })),
  resolveMiniGuideAccessTx: vi.fn(async () => ({
    allowed: state.allowed, source: state.allowed ? "PREMIUM" : "DENIED",
    expiresAt: null, eligibleForGafus: !state.paidOrPrivate,
  })),
  resolveArticleAccessTx: vi.fn(async () => ({
    allowed: state.allowed, source: state.allowed ? "PREMIUM" : "DENIED",
    expiresAt: null, eligibleForGafus: true,
  })),
}));
vi.mock("./settingsService", () => ({
  getGafusSettingsTx: vi.fn(async () => ({
    economyEnabled: state.settingsEnabled,
    spendingEnabled: state.settingsEnabled,
    courseStepCost: 1, miniGuideCost: 1,
    accessDurationSeconds: 604800, revision: 1,
  })),
}));
vi.mock("./walletService", () => ({
  ensureGafusWalletTx: vi.fn(async () => ({ balance: state.balance })),
  changeGafusBalanceTx: vi.fn(async (_tx: unknown, input: {
    userId: string; targetType: string; targetKey: string;
    idempotencyKey: string; amount: number;
  }) => {
    if (state.balance < -input.amount) throw new Error("insufficient");
    state.balance += input.amount;
    state.spent++;
    const id = `transaction-${state.spent}`;
    state.transactions.set(input.idempotencyKey, {
      id, userId: input.userId, kind: "SPEND",
      delta: input.amount, targetType: input.targetType,
      targetKey: input.targetKey, balanceAfter: state.balance,
      targetAccess: null,
    });
    return { transactionId: id, balance: state.balance, replay: false };
  }),
}));

import { unlockContentWithGafus } from "./accessGrantService";

const request = (clientRequestId: string) => ({
  userId: "user-1", clientRequestId,
  target: { type: "COURSE_STEP" as const, dayOnCourseId: "day-1", stepOnDayId: "step-1" },
  now: new Date("2026-10-11T00:00:00Z"),
});

describe("Gafus content unlock transaction", () => {
  beforeEach(() => {
    state.balance = 3;
    state.spent = 0;
    state.allowed = false;
    state.paidOrPrivate = false;
    state.isMiniGuide = false;
    state.settingsEnabled = true;
    state.transactions.clear();
    state.access.clear();
  });
  it("debits once and returns the original access on idempotent retry", async () => {
    const first = await unlockContentWithGafus(request("same-request-001"));
    expect(first).toMatchObject({ spent: 1, balance: 2, replay: false });
    expect(first.expiresAt).toBe("2026-10-18T00:00:00.000Z");
    const second = await unlockContentWithGafus(request("same-request-001"));
    expect(second).toMatchObject({
      spent: 1, balance: 2, replay: true, expiresAt: first.expiresAt,
    });
    expect(state.spent).toBe(1);
  });
  it("normalizes an exercise purchase to a single whole-mini-guide grant", async () => {
    state.isMiniGuide = true;
    const first = await unlockContentWithGafus(request("guide-from-step-001"));
    expect(first).toMatchObject({ spent: 1, balance: 2 });
    expect([...state.transactions.values()][0]).toMatchObject({
      targetType: "MINI_GUIDE", targetKey: "mini-guide:course-1",
    });
    const next = await unlockContentWithGafus(request("guide-from-step-001"));
    expect(next).toMatchObject({ replay: true, spent: 1, balance: 2 });
    expect(state.spent).toBe(1);
  });

  it("unlocks one ARTICLE for exactly 7 days and cannot debit twice on retry", async () => {
    const input = {
      userId: "user-1", clientRequestId: "article-operation-0001",
      target: { type: "ARTICLE" as const, articleId: "article-1" },
      now: new Date("2026-10-11T00:00:00Z"),
    };
    const first = await unlockContentWithGafus(input);
    expect(first).toMatchObject({
      spent: 1, balance: 2, expiresAt: "2026-10-18T00:00:00.000Z",
      replay: false,
    });
    const again = await unlockContentWithGafus(input);
    expect(again).toMatchObject({ spent: 1, balance: 2, replay: true });
    expect(state.spent).toBe(1);
    expect([...state.transactions.values()][0]).toMatchObject({
      targetType: "ARTICLE", targetKey: "article:article-1",
    });
  });

  it("Premium articles do not debit Gafus", async () => {
    state.allowed = true;
    const result = await unlockContentWithGafus({
      userId: "user-1", clientRequestId: "premium-article-0001",
      target: { type: "ARTICLE", articleId: "article-1" },
    });
    expect(result).toMatchObject({ spent: 0, balance: 3, accessSource: "PREMIUM" });
    expect(state.spent).toBe(0);
  });

  it("rejects reuse of the same request for another target", async () => {
    await unlockContentWithGafus(request("request-conflict-01"));
    await expect(unlockContentWithGafus({
      ...request("request-conflict-01"),
      target: { type: "COURSE_STEP", dayOnCourseId: "day-2", stepOnDayId: "step-2" },
    })).rejects.toMatchObject({ code: "GAFUS_IDEMPOTENCY_CONFLICT" });
  });
  it("never charges for access already granted by Premium", async () => {
    state.allowed = true;
    expect(await unlockContentWithGafus(request("premium-check-01"))).toMatchObject({
      spent: 0, balance: 3, accessSource: "PREMIUM",
    });
    expect(state.spent).toBe(0);
  });
  it("cannot unlock a paid or private course", async () => {
    state.paidOrPrivate = true;
    await expect(unlockContentWithGafus(request("paid-private-check"))).rejects.toMatchObject({
      code: "GAFUS_TARGET_NOT_ELIGIBLE",
    });
    expect(state.spent).toBe(0);
  });
  it("rejects insufficient balance and disabled economy", async () => {
    state.balance = 0;
    await expect(unlockContentWithGafus(request("not-enough-01"))).rejects.toMatchObject({
      code: "GAFUS_INSUFFICIENT_BALANCE",
    });
    state.balance = 3;
    state.settingsEnabled = false;
    await expect(unlockContentWithGafus(request("disabled-economy"))).rejects.toMatchObject({
      code: "GAFUS_DISABLED",
    });
    expect(state.spent).toBe(0);
  });
});
