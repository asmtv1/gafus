/**
 * Transactional, actor-scoped video expense persistence.
 * Core owns date/rate validation, authorization decisions, idempotency
 * fingerprint comparisons, CAS conflict policy and audit snapshots.
 */
import { prisma, type Prisma } from "@gafus/prisma";

export type ProfitExpenseDraft = {
  partnerId: string;
  paidAt: Date;
  quantity: number;
  unitPriceKopecks: number;
  amountKopecks: number;
  comment: string | null;
};
export type ProfitExpenseRevision = {
  expenseId: string;
  actorId: string;
  action: "CREATE" | "UPDATE" | "CANCEL";
  snapshot: unknown;
};

function makeProfitWriteRows(tx: Prisma.TransactionClient) {
  return {
    actorRole: (actorId: string) =>
      tx.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    partnerExists: (partnerId: string) =>
      tx.partnerProfile.findUnique({ where: { id: partnerId } }),
    createExpenseOnce: (data: ProfitExpenseDraft, actorId: string, requestKey: string) =>
      tx.profitVideoExpense.createMany({
        data: { ...data, actorId, requestKey },
        skipDuplicates: true,
      }),
    findExpenseByRequestKey: (requestKey: string) =>
      tx.profitVideoExpense.findUniqueOrThrow({ where: { requestKey } }),
    findExpenseById: (id: string) => tx.profitVideoExpense.findUniqueOrThrow({ where: { id } }),
    updateExpenseCAS: (id: string, version: number, data: ProfitExpenseDraft) =>
      tx.profitVideoExpense.updateMany({
        where: { id, version, canceledAt: null },
        data: { ...data, version: { increment: 1 } },
      }),
    cancelExpenseCAS: (id: string, version: number) =>
      tx.profitVideoExpense.updateMany({
        where: { id, version, canceledAt: null },
        data: { canceledAt: new Date(), version: { increment: 1 } },
      }),
    appendRevision: ({ snapshot, ...rest }: ProfitExpenseRevision) =>
      tx.profitVideoExpenseRevision.create({
        data: { ...rest, snapshot: snapshot as Prisma.InputJsonValue },
      }),
  };
}
export type ProfitWriteRows = ReturnType<typeof makeProfitWriteRows>;

export async function withProfitVideoExpenseTx<T>(
  callback: (rows: ProfitWriteRows) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => callback(makeProfitWriteRows(tx)));
}
