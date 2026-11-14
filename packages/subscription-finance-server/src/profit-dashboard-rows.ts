/**
 * Finance/reporting read repository.
 *
 * Owns all Prisma projections inside ONE REPEATABLE READ PostgreSQL snapshot.
 * Core owns period validation, monetary arithmetic, incomplete-data policy,
 * reporting totals and public response mapping.
 */
import { prisma, type Prisma } from "@gafus/prisma";

export type ProfitDashboardRange = {
  start: Date;
  end: Date;
  profitStart: Date;
};

function eligiblePayments(profitStart: Date): Prisma.AppSubscriptionPaymentWhereInput {
  return {
    provider: "YOOKASSA",
    status: { in: ["SUCCEEDED", "REFUNDED"] },
    OR: [
      { providerCapturedAt: { gte: profitStart } },
      { providerCapturedAt: null, succeededAt: { gte: profitStart } },
      { providerCapturedAt: null, succeededAt: null },
    ],
  };
}

function makeProfitReadRows(
  tx: Prisma.TransactionClient,
  { start, end, profitStart }: ProfitDashboardRange,
) {
  const range = { gte: start, lt: end };
  const paymentWhere: Prisma.AppSubscriptionPaymentWhereInput = {
    AND: [
      eligiblePayments(profitStart),
      { OR: [{ providerCapturedAt: range }, { providerCapturedAt: null, succeededAt: range }] },
    ],
  };
  const videoWhere = { paidAt: range };
  return {
    readPaymentBatch(cursor: string | undefined) {
      return tx.appSubscriptionPayment.findMany({
        where: eligiblePayments(profitStart),
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          amount: true,
          currency: true,
          providerIncomeAmount: true,
          providerCapturedAt: true,
          succeededAt: true,
          financeRefundsIncomplete: true,
          status: true,
          financeRefunds: { where: { refundedAt: range }, select: { amountKopecks: true } },
          partnerCommissions: { where: { createdAt: range }, select: { amountKopecks: true } },
        },
      });
    },
    readRefundSums(ids: string[]) {
      return tx.appSubscriptionFinanceRefund.groupBy({
        by: ["paymentId"],
        where: { paymentId: { in: ids } },
        _sum: { amountKopecks: true },
      });
    },
    readPaymentCount() {
      return tx.appSubscriptionPayment.count({ where: paymentWhere });
    },
    readVideoCount() {
      return tx.profitVideoExpense.count({ where: videoWhere });
    },
    readVideoSum() {
      return tx.profitVideoExpense.aggregate({
        where: { ...videoWhere, canceledAt: null },
        _sum: { amountKopecks: true },
      });
    },
    readPartnerRows() {
      return tx.partnerProfile.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          isActive: true,
          user: { select: { username: true, profile: { select: { fullName: true } } } },
        },
      });
    },
    readPaymentPage(page: number, pageSize: number) {
      return tx.appSubscriptionPayment.findMany({
        where: paymentWhere,
        include: { financeRefunds: { select: { amountKopecks: true } } },
        orderBy: [{ providerCapturedAt: "desc" }, { id: "desc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
    },
    readVideoPage(page: number, pageSize: number) {
      return tx.profitVideoExpense.findMany({
        where: videoWhere,
        include: {
          partner: {
            include: {
              user: { select: { username: true, profile: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
    },
  };
}
export type ProfitReadRows = ReturnType<typeof makeProfitReadRows>;

export async function withProfitReadSnapshot<T>(
  range: ProfitDashboardRange,
  callback: (rows: ProfitReadRows) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => callback(makeProfitReadRows(tx, range)), {
    isolationLevel: "RepeatableRead",
    maxWait: 10000,
    timeout: 30000,
  });
}
