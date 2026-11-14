/**
 * Gafus administrator-only persistence transactions.
 *
 * Core owns RBAC, settings validation, wallet rules, fraud review decisions,
 * audit semantics and Gafus errors; only this adapter issues SQL.
 *
 * rawTx bridges existing Core wallet/settings transactions until their
 * business ports can use a strictly domain-owned transaction capability.
 */
import { prisma, type Prisma } from "@gafus/prisma";

export type GafusAdminSettingsDraft = {
  revision: number;
  economyEnabled: boolean;
  earningEnabled: boolean;
  spendingEnabled: boolean;
  postReward: number;
  questionReward: number;
  answerReward: number;
  activityLimit: number;
  activityWindowSeconds: number;
  reactionThreshold: number;
  reactionReward: number;
  bestAnswerReward: number;
  courseStepCost: number;
  miniGuideCost: number;
  accessDurationSeconds: number;
};
export type GafusAdminAuditDraft = {
  actorId: string;
  action: string;
  reason: string;
  targetUserId?: string | null;
  transactionId?: string | null;
  before?: unknown;
  after?: unknown;
};
type FraudSignalStatus = "OPEN" | "RESOLVED" | "DISMISSED";

function makeGafusAdminRows(tx: Prisma.TransactionClient) {
  return {
    rawTx: tx,
    actorRole(actorId: string) {
      return tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    },
    async lockSettings() {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('gafus-settings'))::text AS locked`;
    },
    upsertSettings(next: GafusAdminSettingsDraft, actorId: string) {
      return tx.gafusSettings.upsert({
        where: { key: "default" },
        create: { key: "default", ...next, updatedById: actorId },
        update: { ...next, updatedById: actorId },
      });
    },
    appendSettingsRevision(revision: number, actorId: string, snapshot: GafusAdminSettingsDraft) {
      return tx.gafusSettingsRevision.create({
        data: { revision, actorId, snapshot: snapshot as Prisma.InputJsonValue },
      });
    },
    appendAudit({ before, after, ...data }: GafusAdminAuditDraft) {
      return tx.gafusAdminAudit.create({
        data: {
          ...data,
          ...(before !== undefined ? { before: before as Prisma.InputJsonValue } : {}),
          ...(after !== undefined ? { after: after as Prisma.InputJsonValue } : {}),
        },
      });
    },
    findTransactionByKey(key: string) {
      return tx.gafusTransaction.findUnique({ where: { idempotencyKey: key } });
    },
    walletBalance(userId: string) {
      return tx.gafusWallet.findUnique({ where: { userId }, select: { balance: true } });
    },
    annotateTransaction(transactionId: string, adminActorId: string, reason: string) {
      return tx.gafusTransaction.update({
        where: { id: transactionId },
        data: { adminActorId, reason },
      });
    },
    walletTotals() {
      return tx.gafusWallet.aggregate({ _sum: { balance: true }, _count: { _all: true } });
    },
    ledgerTotals() {
      return tx.gafusTransaction.groupBy({
        by: ["kind"],
        _sum: { delta: true },
        _count: { _all: true },
      });
    },
    countOpenFraud() {
      return tx.gafusFraudSignal.count({ where: { status: "OPEN" } });
    },
    listFraudSignals(status?: FraudSignalStatus) {
      return tx.gafusFraudSignal.findMany({
        where: status ? { status } : undefined,
        select: {
          id: true,
          userId: true,
          severity: true,
          status: true,
          kind: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          resolvedAt: true,
          resolvedById: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      });
    },
    findFraudSignal(id: string) {
      return tx.gafusFraudSignal.findUnique({ where: { id } });
    },
    updateOpenFraudSignal(id: string, status: FraudSignalStatus, actorId: string) {
      return tx.gafusFraudSignal.updateMany({
        where: { id, status: "OPEN" },
        data: { status, resolvedById: actorId, resolvedAt: new Date() },
      });
    },
  };
}

export type GafusAdminRows = ReturnType<typeof makeGafusAdminRows>;

export async function withGafusAdminRows<T>(
  operation: (rows: GafusAdminRows) => Promise<T>,
  options?: { maxWait: number; timeout: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => operation(makeGafusAdminRows(tx)), options);
}
