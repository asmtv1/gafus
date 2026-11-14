import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withLockedRewardedWallet,
  ensureRewardedWalletRow,
  updateRewardedWalletRow,
  countTodayRewardedAds,
  hasRewardedTargetSpendRow,
  findRewardedTransactionByKey,
  appendRewardedWalletEntry,
} from "./rewardedWalletRows";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  walletUpsert: vi.fn(),
  walletUpdate: vi.fn(),
  adCount: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));
const tx = {
  $executeRawUnsafe: mock.lock,
  rewardedCreditWallet: { upsert: mock.walletUpsert, update: mock.walletUpdate },
  rewardedAdSession: { count: mock.adCount },
  rewardedCreditTransaction: {
    findFirst: mock.findFirst,
    findUnique: mock.findUnique,
    create: mock.create,
  },
};
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: mock.transaction,
    rewardedCreditWallet: { upsert: mock.walletUpsert },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  mock.transaction.mockImplementation(async (cb) => cb(tx));
});

describe("Rewarded credit wallet locked SQL port", () => {
  it("locks the per-user wallet for a whole transactional callback", async () => {
    const callback = vi.fn(async (current) => {
      expect(current).toBe(tx);
      await ensureRewardedWalletRow("user-1", current);
      await updateRewardedWalletRow(current, "user-1", { balance: 5 });
    });
    await withLockedRewardedWallet("user-1", callback);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.lock).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "rewarded:user-1",
    );
    expect(mock.walletUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", balance: 0, pendingRefundCredits: 0 },
      update: {},
    });
    expect(mock.walletUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { balance: 5 },
    });
  });

  it("reads no other principal's ad sessions or target spend", async () => {
    const start = new Date("2026-11-10T00:00:00Z");
    const end = new Date("2026-11-11T00:00:00Z");
    await countTodayRewardedAds(tx, "user-1", start, end);
    expect(mock.adCount).toHaveBeenCalledWith({
      where: { userId: "user-1", rewardedAt: { gte: start, lt: end } },
    });
    mock.findFirst.mockResolvedValue({ id: "spent-1" });
    expect(
      await hasRewardedTargetSpendRow(tx, "user-1", {
        targetType: "ARTICLE",
        targetId: "article-1",
      }),
    ).toBe(true);
    expect(mock.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "SPEND", targetType: "ARTICLE", targetId: "article-1" },
      select: { id: true },
    });
  });

  it("persists exactly one transaction for a replay key; server normalizes metadata as JSON", async () => {
    await findRewardedTransactionByKey(tx, "earn:1");
    expect(mock.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: "earn:1" } });
    await appendRewardedWalletEntry(tx, {
      userId: "user-1",
      type: "SPEND",
      amount: 1,
      balanceBefore: 5,
      balanceAfter: 4,
      targetType: "ARTICLE",
      targetId: "article-1",
      idempotencyKey: "spend:1",
      metadata: { nested: { origin: "test" } },
    });
    expect(mock.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        type: "SPEND",
        amount: 1,
        balanceBefore: 5,
        balanceAfter: 4,
        targetType: "ARTICLE",
        targetId: "article-1",
        idempotencyKey: "spend:1",
        metadata: { nested: { origin: "test" } },
      },
    });
  });

  it("a thrown callback keeps failure inside the database transaction", async () => {
    await expect(
      withLockedRewardedWallet("user-1", async () => {
        throw new Error("SYNTHETIC_FAILURE");
      }),
    ).rejects.toThrow("SYNTHETIC_FAILURE");
  });
});
