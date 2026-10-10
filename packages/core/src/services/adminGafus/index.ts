import { prisma, type Prisma } from "@gafus/prisma";
import { getGafusSettingsTx, DEFAULT_GAFUS_SETTINGS } from "../gafus/settingsService";
import { lockGafusUser } from "../gafus/locking";
import { changeGafusBalanceTx } from "../gafus/walletService";
import { GafusError } from "../gafus/errors";
import type { GafusSettingsConfig, GafusTx } from "../gafus/types";

type MutableSetting = Exclude<keyof GafusSettingsConfig, "revision">;
const keys: readonly MutableSetting[] = [
  "economyEnabled", "earningEnabled", "spendingEnabled",
  "postReward", "questionReward", "answerReward", "activityLimit",
  "activityWindowSeconds", "reactionThreshold", "reactionReward",
  "bestAnswerReward", "courseStepCost", "miniGuideCost",
  "accessDurationSeconds",
] as const;

async function requireAdminTx(tx: GafusTx, actorId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
}

function validateSettings(settings: GafusSettingsConfig) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof DEFAULT_GAFUS_SETTINGS[key] === "boolean") {
      if (typeof value !== "boolean") throw new Error(`INVALID_SETTING:${key}`);
    } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`INVALID_SETTING:${key}`);
    }
  }
  if (settings.reactionThreshold < 1 || settings.courseStepCost < 1
    || settings.miniGuideCost < 1 || settings.activityWindowSeconds < 1
    || settings.accessDurationSeconds < 1) {
    throw new Error("INVALID_SETTING:positive_values");
  }
  if (settings.activityLimit > 100 || settings.accessDurationSeconds > 90 * 86400
    || settings.reactionThreshold > 1_000_000) {
    throw new Error("INVALID_SETTING:outside_limits");
  }
}

/** Admin-only settings: revision, audit and snapshot commit together. */
export async function updateGafusSettingsAdmin(input: {
  actorId: string; expectedRevision: number; patch: Partial<Omit<GafusSettingsConfig, "revision">>;
  reason: string;
}) {
  if (input.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
  const unsupported = Object.keys(input.patch).filter(key => !keys.includes(key as MutableSetting));
  if (unsupported.length) throw new Error("INVALID_SETTINGS_KEYS");
  return prisma.$transaction(async tx => {
    await requireAdminTx(tx, input.actorId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('gafus-settings'))::text AS locked`;
    const previous = await getGafusSettingsTx(tx);
    if (previous.revision !== input.expectedRevision) throw new Error("SETTINGS_REVISION_CONFLICT");
    const next = { ...previous, ...input.patch, revision: previous.revision + 1 };
    validateSettings(next);

    await tx.gafusSettings.upsert({
      where: { key: "default" },
      create: { key: "default", ...next, updatedById: input.actorId },
      update: { ...next, updatedById: input.actorId },
    });
    await tx.gafusSettingsRevision.create({
      data: { revision: next.revision, actorId: input.actorId, snapshot: next as Prisma.InputJsonValue },
    });
    await tx.gafusAdminAudit.create({
      data: {
        actorId: input.actorId, action: "SETTINGS_UPDATED",
        reason: input.reason.trim(), before: previous as Prisma.InputJsonValue,
        after: next as Prisma.InputJsonValue,
      },
    });
    return next;
  }, { maxWait: 10_000, timeout: 30_000 });
}

/** Positive and negative manual wallet changes are ledgered and never produce debt. */
export async function adjustGafusBalanceAdmin(input: {
  actorId: string; userId: string; delta: number;
  requestId: string; reason: string;
}) {
  if (!input.reason.trim() || input.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
  if (!Number.isSafeInteger(input.delta) || Math.abs(input.delta) > 10000 || input.delta === 0) {
    throw new GafusError("GAFUS_INVALID_AMOUNT", "Invalid admin balance adjustment");
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId)) throw new Error("INVALID_REQUEST_ID");
  return prisma.$transaction(async tx => {
    await requireAdminTx(tx, input.actorId);
    await lockGafusUser(tx, input.userId);
    const key = `gafus:admin:${input.actorId}:${input.requestId}`;
    const existing = await tx.gafusTransaction.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.userId !== input.userId || existing.delta !== input.delta
        || existing.adminActorId !== input.actorId) throw new Error("REQUEST_CONFLICT");
      return { transactionId: existing.id, balance: existing.balanceAfter, replay: true };
    }
    const wallet = await tx.gafusWallet.findUnique({ where: { userId: input.userId } });
    const before = wallet?.balance ?? 0;
    if (input.delta < 0 && before < -input.delta) throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Insufficient funds");
    const transaction = await changeGafusBalanceTx(tx, {
      userId: input.userId, amount: input.delta,
      kind: input.delta > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
      idempotencyKey: key,
    });
    await tx.gafusTransaction.update({
      where: { id: transaction.transactionId },
      data: { adminActorId: input.actorId, reason: input.reason.trim() },
    });
    await tx.gafusAdminAudit.create({
      data: {
        actorId: input.actorId, targetUserId: input.userId,
        action: "WALLET_ADJUSTMENT", reason: input.reason.trim(),
        transactionId: transaction.transactionId,
        before: { balance: before },
        after: { balance: transaction.balance, delta: input.delta },
      },
    });
    return transaction;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function getGafusAdminDashboard(actorId: string) {
  return prisma.$transaction(async tx => {
    await requireAdminTx(tx, actorId);
    const [settings, balances, transactions, fraudOpen] = await Promise.all([
      getGafusSettingsTx(tx),
      tx.gafusWallet.aggregate({ _sum: { balance: true }, _count: { _all: true } }),
      tx.gafusTransaction.groupBy({
        by: ["kind"], _sum: { delta: true }, _count: { _all: true },
      }),
      tx.gafusFraudSignal.count({ where: { status: "OPEN" } }),
    ]);
    return {
      settings,
      wallets: { count: balances._count._all, outstanding: balances._sum.balance ?? 0 },
      transactions,
      fraudOpen,
    };
  });
}
export async function listGafusFraudSignalsAdmin(input: {
  actorId: string; status?: "OPEN" | "RESOLVED" | "DISMISSED";
}) {
  return prisma.$transaction(async tx => {
    await requireAdminTx(tx, input.actorId);
    return tx.gafusFraudSignal.findMany({
      where: input.status ? { status: input.status } : undefined,
      select: {
        id: true, userId: true, severity: true, status: true,
        kind: true, entityType: true, entityId: true,
        metadata: true, createdAt: true, resolvedAt: true, resolvedById: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  });
}

/**
 * Soft signal review. Confirmed fraud recovers at most the balance on hand:
 * no negative balances, no speculative debt, and no duplicate adjustments.
 */
export async function reviewGafusFraudSignalAdmin(input: {
  actorId: string; signalId: string;
  action: "DISMISS" | "CONFIRM";
  requestedReversal?: number; reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new Error("REASON_REQUIRED");
  if (input.action === "CONFIRM" &&
    (!Number.isSafeInteger(input.requestedReversal) ||
      (input.requestedReversal ?? 0) < 0 || (input.requestedReversal ?? 0) > 10000)) {
    throw new Error("INVALID_REVERSAL");
  }
  return prisma.$transaction(async tx => {
    await requireAdminTx(tx, input.actorId);
    const signal = await tx.gafusFraudSignal.findUnique({
      where: { id: input.signalId },
    });
    if (!signal) throw new Error("FRAUD_SIGNAL_NOT_FOUND");
    await lockGafusUser(tx, signal.userId);
    const current = await tx.gafusFraudSignal.findUnique({
      where: { id: input.signalId },
    });
    if (current?.status !== "OPEN") throw new Error("FRAUD_SIGNAL_ALREADY_REVIEWED");
    const requested = input.action === "CONFIRM" ? (input.requestedReversal ?? 0) : 0;
    const wallet = await tx.gafusWallet.findUnique({
      where: { userId: signal.userId }, select: { balance: true },
    });
    const balance = wallet?.balance ?? 0;
    const recovered = Math.min(balance, requested);
    let transactionId: string | null = null;
    if (recovered > 0) {
      const spent = await changeGafusBalanceTx(tx, {
        userId: signal.userId, amount: -recovered, kind: "ADMIN_DEBIT",
        idempotencyKey: `gafus:fraud:${signal.id}`,
      });
      transactionId = spent.transactionId;
      await tx.gafusTransaction.update({
        where: { id: transactionId },
        data: { adminActorId: input.actorId, reason },
      });
    }
    const nextStatus = input.action === "CONFIRM" ? "RESOLVED" : "DISMISSED";
    const result = await tx.gafusFraudSignal.updateMany({
      where: { id: signal.id, status: "OPEN" },
      data: { status: nextStatus, resolvedById: input.actorId, resolvedAt: new Date() },
    });
    if (result.count !== 1) throw new Error("FRAUD_SIGNAL_ALREADY_REVIEWED");
    await tx.gafusAdminAudit.create({
      data: {
        actorId: input.actorId, targetUserId: signal.userId,
        action: input.action === "CONFIRM" ? "FRAUD_CONFIRMED" : "FRAUD_DISMISSED",
        reason, transactionId,
        before: {
          signalId: signal.id, status: signal.status, balance,
        },
        after: {
          signalId: signal.id, status: nextStatus,
          requestedFraudReversal: requested,
          recovered, unrecovered: requested - recovered,
        },
      },
    });
    return { signalId: signal.id, status: nextStatus, requested, recovered, unrecovered: requested - recovered };
  }, { maxWait: 10_000, timeout: 30_000 });
}
