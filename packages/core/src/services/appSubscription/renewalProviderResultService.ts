import { prisma } from "@gafus/prisma";
import { getNextRenewalAttemptAt } from "./renewalPolicy";

/** Record a provider failure; retry and subscription state policies belong in core. */
export async function recordYookassaRenewalFailure(input: {
  paymentId: string;
  subscriptionId: string;
  code: "NETWORK" | "YOOKASSA_REJECTED" | "INVALID_PROVIDER_RESPONSE" | "PROVIDER_AMOUNT_MISMATCH";
  reason: string;
  retry: boolean;
  pastDue: boolean;
  now: Date;
  attemptCount: number;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.appSubscriptionPayment.update({
      where: { id: input.paymentId },
      data: {
        status: "FAILED",
        failureCode: input.code,
        failureReason: input.reason.slice(0, 512),
        ...(input.retry ? { nextAttemptAt: getNextRenewalAttemptAt(input.now, input.attemptCount) } : {}),
      },
    });
    if (input.pastDue) {
      await tx.appSubscription.update({
        where: { id: input.subscriptionId },
        data: { status: "PAST_DUE" },
      });
    }
  });
}

export async function recordYookassaRenewalProviderId(paymentId: string, providerId: string) {
  return prisma.appSubscriptionPayment.update({
    where: { id: paymentId }, data: { yookassaPaymentId: providerId },
  });
}

export async function recordYookassaRenewalCanceled(paymentId: string, providerId: string) {
  return prisma.appSubscriptionPayment.update({
    where: { id: paymentId },
    data: { status: "CANCELED", yookassaPaymentId: providerId },
  });
}
