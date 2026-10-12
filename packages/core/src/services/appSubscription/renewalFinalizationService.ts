import { prisma } from "@gafus/prisma";
import { recordPartnerCommissionForPayment } from "./partnerService";
import { ensureNpdReceiptForSucceededPayment } from "./npdReceiptService";

/** Atomically commit a successfully verified provider payment and its billing period. */
export async function finalizeVerifiedSubscriptionRenewal(input: {
  paymentId: string;
  subscriptionId: string;
  userId: string;
  planCode: "WEEKLY" | "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
  kind: "INITIAL" | "RENEWAL";
  providerPaymentId: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const claimed = await tx.appSubscriptionPayment.updateMany({
      where: { id: input.paymentId, status: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: {
        status: "SUCCEEDED", planCode: input.planCode,
        yookassaPaymentId: input.providerPaymentId,
        currency: input.currency, periodStart: input.periodStart,
        periodEnd: input.periodEnd, succeededAt: new Date(),
        financeRefundsIncomplete: false,
      },
    });
    if (claimed.count !== 1) return false;

    await tx.appSubscription.update({
      where: { id: input.subscriptionId, currentPeriodEnd: input.periodStart },
      data: {
        status: "ACTIVE", planCode: input.planCode,
        currentPeriodStart: input.periodStart,
        currentPeriodEnd: input.periodEnd,
        renewalReminderSentForPeriodEnd: null,
      },
    });
    await recordPartnerCommissionForPayment(tx, {
      id: input.paymentId, userId: input.userId,
      planCode: input.planCode, subscriptionId: input.subscriptionId,
      kind: input.kind,
    });
    await ensureNpdReceiptForSucceededPayment(tx, input.paymentId);
    return true;
  });
}
