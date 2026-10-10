import { prisma } from "@gafus/prisma";
import { lockGafusUser } from "./locking";
import { changeGafusBalanceTx } from "./walletService";

type LegacyUserBalance = { userId: string; balance: number };

function requireCutover() {
  if (process.env.GAFUS_LEGACY_REWARDED_DISABLED !== "true" ||
      process.env.GAFUS_LEGACY_IMPORT_ENABLED !== "true") {
    throw new Error("LEGACY_IMPORT_DISABLED");
  }
}

async function requireAdmin(actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (user?.role !== "ADMIN") throw new Error("FORBIDDEN");
}

/** Read-only preflight, including unsettled refunds and unfinished ad sessions. */
export async function getLegacyGafusImportPreflight(actorId: string) {
  await requireAdmin(actorId);
  const [balances, pendingRefunds, unsettledSessions, imported] = await Promise.all([
    prisma.rewardedCreditWallet.aggregate({
      where: { balance: { gt: 0 } },
      _count: { _all: true }, _sum: { balance: true },
    }),
    prisma.rewardedCreditWallet.aggregate({
      where: { pendingRefundCredits: { gt: 0 } },
      _count: { _all: true }, _sum: { pendingRefundCredits: true },
    }),
    prisma.rewardedAdSession.count({
      where: {
        status: { in: ["SHOWN", "REWARDED"] },
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.gafusTransaction.count({ where: { kind: "LEGACY_IMPORT" } }),
  ]);
  return {
    activeWallets: balances._count._all,
    credits: balances._sum.balance ?? 0,
    pendingRefundWallets: pendingRefunds._count._all,
    pendingRefundCredits: pendingRefunds._sum.pendingRefundCredits ?? 0,
    unsettledSessions,
    imported,
    cutoverDisabled: process.env.GAFUS_LEGACY_REWARDED_DISABLED === "true",
    importEnabled: process.env.GAFUS_LEGACY_IMPORT_ENABLED === "true",
  };
}

/**
 * Operator-triggered batches; never run in requests, cron or app startup.
 * Old rows remain untouched for audit. The ledger key ensures retries are free.
 * Each user import is a separate atomic transaction.
 */
export async function importLegacyRewardedBatch(input: {
  actorId: string;
  confirmed: boolean;
  batchSize?: number;
  cursor?: string;
}) {
  await requireAdmin(input.actorId);
  requireCutover();
  if (!input.confirmed) throw new Error("LEGACY_IMPORT_CONFIRMATION_REQUIRED");
  const batchSize = Math.min(Math.max(1, input.batchSize ?? 50), 100);
  const preflight = await getLegacyGafusImportPreflight(input.actorId);
  if (preflight.pendingRefundCredits !== 0 || preflight.unsettledSessions !== 0) {
    throw new Error("LEGACY_IMPORT_UNSETTLED_STATE");
  }
  const rows = await prisma.rewardedCreditWallet.findMany({
    where: { balance: { gt: 0 } },
    orderBy: { userId: "asc" },
    ...(input.cursor ? { cursor: { userId: input.cursor }, skip: 1 } : {}),
    take: batchSize + 1,
    select: { userId: true, balance: true },
  });
  const batch = rows.slice(0, batchSize);
  const nextCursor = rows.length > batchSize ? batch[batch.length - 1]?.userId ?? null : null;
  let imported = 0;
  let credits = 0;
  let replays = 0;
  const actorId = input.actorId;
  for (const wallet of batch) {
    const result = await importOne(actorId, wallet);
    if (result.imported) {
      imported++;
      credits += result.amount;
    } else if (result.replay) replays++;
  }
  return { processed: batch.length, imported, credits, replays, nextCursor };
}

async function importOne(actorId: string, row: LegacyUserBalance) {
  return prisma.$transaction(async tx => {
    await lockGafusUser(tx, row.userId);
    const key = `legacy-rewarded-balance:${row.userId}`;
    const prior = await tx.gafusTransaction.findUnique({ where: { idempotencyKey: key } });
    if (prior) return { imported: false, replay: true, amount: 0 };
    const original = await tx.rewardedCreditWallet.findUnique({
      where: { userId: row.userId },
      select: { balance: true, pendingRefundCredits: true },
    });
    if (!original || original.balance <= 0) return { imported: false, replay: false, amount: 0 };
    if (original.balance !== row.balance || original.pendingRefundCredits !== 0) {
      throw new Error("LEGACY_IMPORT_BALANCE_CHANGED");
    }
    if (!Number.isSafeInteger(original.balance)) throw new Error("LEGACY_IMPORT_INVALID_BALANCE");
    const next = await changeGafusBalanceTx(tx, {
      userId: row.userId,
      amount: original.balance,
      kind: "LEGACY_IMPORT",
      idempotencyKey: key,
      metadata: { source: "RewardedCreditWallet", originalBalance: original.balance },
    });
    await tx.gafusAdminAudit.create({
      data: {
        actorId, targetUserId: row.userId, action: "LEGACY_BALANCE_IMPORTED",
        transactionId: next.transactionId,
        reason: "One-time conversion of pre-existing rewarded credits after advertising cutover",
        before: { balance: original.balance },
        after: { importedGafus: original.balance, previousRowRetained: true },
      },
    });
    return { imported: true, replay: false, amount: original.balance };
  }, { maxWait: 10_000, timeout: 30_000 });
}
