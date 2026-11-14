/** Strict opt-in on disposable localhost PostgreSQL18 only. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  withLockedRewardedWallet,
  ensureRewardedWalletRow,
  updateRewardedWalletRow,
  countTodayRewardedAds,
  hasRewardedTargetSpendRow,
  findRewardedTransactionByKey,
  appendRewardedWalletEntry,
} from "./rewardedWalletRows";

const qa = describe.runIf(process.env.GAFUS_REWARDED_WALLET_REAL_PG === "enabled");
const owner = "rewarded-wallet-qa-owner";
const other = "rewarded-wallet-qa-other";
let disposable = false;

qa("rewarded credits SQL same-user serialization on real PG18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_rewarded_wallet_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_rewarded_wallet_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    disposable = true;
    await prisma.user.createMany({
      data: [
        { id: owner, username: owner, password: "fictional-test-only", role: "USER" },
        { id: other, username: other, password: "fictional-test-only", role: "USER" },
      ],
    });
  });
  afterAll(async () => {
    if (!disposable) return;
    await prisma.rewardedCreditTransaction.deleteMany({
      where: { userId: { in: [owner, other] } },
    });
    await prisma.rewardedCreditWallet.deleteMany({ where: { userId: { in: [owner, other] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });
  it("upserts one isolated wallet for each authenticated principal", async () => {
    const left = await ensureRewardedWalletRow(owner);
    const right = await ensureRewardedWalletRow(other);
    expect(left).toMatchObject({ userId: owner, balance: 0, pendingRefundCredits: 0 });
    expect(right).toMatchObject({ userId: other, balance: 0, pendingRefundCredits: 0 });
    expect(
      await countTodayRewardedAds(
        prisma as never,
        owner,
        new Date("2026-11-09Z"),
        new Date("2026-11-11Z"),
      ),
    ).toBe(0);
  });
  it("serializes two concurrent increments under the actual advisory lock", async () => {
    const increment = () =>
      withLockedRewardedWallet(owner, async (tx) => {
        const before = await ensureRewardedWalletRow(owner, tx);
        await new Promise((r) => setTimeout(r, 15));
        await updateRewardedWalletRow(tx, owner, { balance: before.balance + 1 });
      });
    await Promise.all([increment(), increment()]);
    expect(
      (await prisma.rewardedCreditWallet.findUnique({ where: { userId: owner } }))?.balance,
    ).toBe(2);
    expect(
      (await prisma.rewardedCreditWallet.findUnique({ where: { userId: other } }))?.balance,
    ).toBe(0);
  }, 30000);
  it("creates JSON metadata only in owner's transaction; finds idempotency replay", async () => {
    await withLockedRewardedWallet(owner, async (tx) => {
      const row = await appendRewardedWalletEntry(tx, {
        userId: owner,
        type: "SPEND",
        amount: 1,
        balanceBefore: 2,
        balanceAfter: 1,
        targetType: "ARTICLE",
        targetId: "synthetic-article",
        idempotencyKey: "rewarded-wallet-qa-spend",
        metadata: { origin: "synthetic" },
      });
      expect(row.metadata).toEqual({ origin: "synthetic" });
      expect((await findRewardedTransactionByKey(tx, "rewarded-wallet-qa-spend"))?.id).toBe(row.id);
      expect(
        await hasRewardedTargetSpendRow(tx, owner, {
          targetType: "ARTICLE",
          targetId: "synthetic-article",
        }),
      ).toBe(true);
      expect(
        await hasRewardedTargetSpendRow(tx, other, {
          targetType: "ARTICLE",
          targetId: "synthetic-article",
        }),
      ).toBe(false);
    });
    expect(
      await prisma.rewardedCreditTransaction.count({
        where: { idempotencyKey: "rewarded-wallet-qa-spend" },
      }),
    ).toBe(1);
  });
  it("rolls back both wallet balance and ledger entry on failed database transaction", async () => {
    await expect(
      withLockedRewardedWallet(owner, async (tx) => {
        await updateRewardedWalletRow(tx, owner, { balance: 999 });
        await appendRewardedWalletEntry(tx, {
          userId: owner,
          type: "SPEND",
          amount: 1,
          balanceBefore: 2,
          balanceAfter: 1,
          targetType: "ARTICLE",
          targetId: "synthetic-other",
          idempotencyKey: "rewarded-wallet-qa-rollback",
        });
        throw Error("SYNTHETIC_ROLLBACK");
      }),
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");
    expect(
      (await prisma.rewardedCreditWallet.findUnique({ where: { userId: owner } }))?.balance,
    ).toBe(2);
    expect(
      await prisma.rewardedCreditTransaction.count({
        where: { idempotencyKey: "rewarded-wallet-qa-rollback" },
      }),
    ).toBe(0);
  });
});
