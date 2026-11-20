/** Durable, transaction-owned persistence of a *verified* Apple server state.
 * JWS decoding, Apple HTTP and entitlement decisions do not belong to this adapter.
 * Called by both API notifications and Worker reconciliation via paymentService.
 */
import { prisma } from "@gafus/prisma";
import type { AppleServerSyncStatus } from "@gafus/subscription-shared/paymentPure";
import type { AppSubscriptionPlanCode } from "@gafus/prisma";

export type VerifiedAppleServerState = {
  subscription: { id: string; userId: string };
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  status: AppleServerSyncStatus;
  planCode: AppSubscriptionPlanCode;
  paymentStatus: "SUCCEEDED" | "CANCELED" | "FAILED" | "REFUNDED";
  periodStart: Date;
  periodEnd: Date | null;
  priceMilliunits: number | null;
  currency: string | null;
  transaction: {
    storefront?: string;
    environment?: string;
    webOrderLineItemId?: string | number;
  };
  renewal: {
    autoRenewStatus?: number;
    expirationIntent?: number;
    isInBillingRetryPeriod?: boolean;
    gracePeriodExpiresDate?: number;
    renewalDate?: number;
    renewalPrice?: number;
  } | null;
  appleStatus: number | null;
};

export async function persistVerifiedAppleServerState(params: VerifiedAppleServerState): Promise<void> {
  const {
    subscription, originalTransactionId, transactionId, productId, status,
    planCode, paymentStatus, periodStart, periodEnd, priceMilliunits, currency,
    transaction, renewal, appleStatus,
  } = params;
  const appleMilliunitsToAmount = (price: number | null): number | null =>
    price === null || !Number.isFinite(price) || price < 0 ? null : Number((price / 1000).toFixed(3));
  const isPrismaUniqueViolation = (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    await prisma.$transaction(async (tx) => {
      // Serializes a provider callback with the Worker reconciliation path.
      await tx.$queryRaw`SELECT id FROM "AppSubscription" WHERE id=${subscription.id} FOR UPDATE`;
      const prior = await tx.appSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
        select: { currentPeriodStart: true, currentPeriodEnd: true, status: true },
      });
      // A verified but older server response must not undo a newer paid period
      // or regrant one whose last-known status was REVOKED. The subscription
      // row lock covers BOTH the comparison and the write; the immutable event
      // and payment receipts are still de-duplicated separately below.
      const olderPeriod = Boolean(
        (prior.currentPeriodStart && periodStart < prior.currentPeriodStart) ||
        (prior.currentPeriodEnd && periodEnd && periodEnd < prior.currentPeriodEnd),
      );
      const revokedPeriodRegrant = prior.status === "REVOKED" && status === "ACTIVE" &&
        (!prior.currentPeriodEnd || !periodEnd || periodEnd <= prior.currentPeriodEnd);
      if (!olderPeriod && !revokedPeriodRegrant) await tx.appSubscription.update({
        where: { id: subscription.id },
        data: {
          status,
          planCode,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
          ...(status === "REVOKED" || status === "EXPIRED" ? { canceledAt: new Date() } : {}),
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
        },
      });

      const existingPayment = await tx.appSubscriptionPayment.findUnique({
        where: { appleTransactionId: transactionId },
        select: { id: true },
      });
      if (!existingPayment) {
        await tx.appSubscriptionPayment.create({
          data: {
            subscriptionId: subscription.id,
            userId: subscription.userId,
            provider: "APPLE",
            kind: "RENEWAL",
            status: paymentStatus,
            planCode,
            amount: appleMilliunitsToAmount(priceMilliunits),
            currency,
            periodStart,
            periodEnd,
            idempotenceKey: `apple:${transactionId}`,
            appleTransactionId: transactionId,
            appleOriginalTransactionId: originalTransactionId,
            applePriceMilliunits: priceMilliunits,
            appleStorefront: transaction.storefront ?? null,
            appleEnvironment: transaction.environment ?? null,
            appleWebOrderLineItemId:
              transaction.webOrderLineItemId != null
                ? String(transaction.webOrderLineItemId)
                : null,
            succeededAt: paymentStatus === "SUCCEEDED" ? new Date() : null,
          },
        });
      }

      const syncEventIdempotencyKey = `apple-sync:${transactionId}`;
      const existingSyncEvent = await tx.appSubscriptionEvent.findUnique({
        where: { idempotencyKey: syncEventIdempotencyKey },
        select: { id: true },
      });
      if (!existingSyncEvent) {
        await tx.appSubscriptionEvent
          .create({
            data: {
              subscriptionId: subscription.id,
              userId: subscription.userId,
              source: "APPLE",
              eventType: `SERVER_SYNC:${status}`,
              idempotencyKey: syncEventIdempotencyKey,
              processingStatus: "PROCESSED",
              metadata: {
                originalTransactionId,
                transactionId,
                productId,
                appleStatus: appleStatus,
                autoRenewStatus: renewal?.autoRenewStatus ?? null,
                expirationIntent: renewal?.expirationIntent ?? null,
                isInBillingRetryPeriod: renewal?.isInBillingRetryPeriod ?? null,
                gracePeriodExpiresDate: renewal?.gracePeriodExpiresDate ?? null,
                renewalDate: renewal?.renewalDate ?? null,
                renewalPrice: renewal?.renewalPrice ?? null,
                currency,
              },
              processedAt: new Date(),
            },
          })
          .catch((error) => {
            if (isPrismaUniqueViolation(error)) return undefined;
            throw error;
          });
      }
    });

}
