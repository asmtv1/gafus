/** Durable, transaction-owned persistence of a *verified* Apple server state.
 * JWS decoding, Apple HTTP and entitlement decisions do not belong to this adapter.
 * Called by both API notifications and Worker reconciliation via paymentService.
 */
import { prisma } from "@gafus/prisma";
import { createHash } from "node:crypto";
import { selectAppleSyncOwner } from "./appleSyncOwner";
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
    appAccountToken?: string;
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

type ApplePeriod = {
  status: AppleServerSyncStatus;
  periodStart: Date;
  periodEnd: Date | null;
};
export function canApplyApplePeriod(prior: {
  status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
}, incoming: ApplePeriod): boolean {
  const olderPeriod = Boolean(
    (prior.currentPeriodStart && incoming.periodStart < prior.currentPeriodStart) ||
    (prior.currentPeriodEnd && incoming.periodEnd && incoming.periodEnd < prior.currentPeriodEnd),
  );
  const revokedPeriodRegrant = prior.status === "REVOKED" && incoming.status === "ACTIVE" &&
    (!prior.currentPeriodEnd || !incoming.periodEnd || incoming.periodEnd <= prior.currentPeriodEnd);
  return !olderPeriod && !revokedPeriodRegrant;
}

export async function persistVerifiedAppleServerState(params: VerifiedAppleServerState): Promise<AppleServerSyncStatus> {
  const {
    subscription, originalTransactionId, transactionId, productId, status,
    planCode, paymentStatus, periodStart, periodEnd, priceMilliunits, currency,
    transaction, renewal, appleStatus,
  } = params;
  const appleMilliunitsToAmount = (price: number | null): number | null =>
    price === null || !Number.isFinite(price) || price < 0 ? null : Number((price / 1000).toFixed(3));
  const isPrismaUniqueViolation = (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return prisma.$transaction(async (tx): Promise<AppleServerSyncStatus> => {
      const lockKey = createHash("sha256").update(originalTransactionId).digest().readInt32BE(0);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${APPLE_PURCHASE_LOCK_NAMESPACE}::int, ${lockKey}::int)`;
      // Serializes a provider callback with the Worker reconciliation path.
      await tx.$queryRaw`SELECT id FROM "AppSubscription" WHERE id=${subscription.id} FOR UPDATE`;
      const prior = await tx.appSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
        select: { currentPeriodStart: true, currentPeriodEnd: true, status: true, userId: true, appleOriginalTransactionId: true },
      });
      if (prior.userId !== subscription.userId || prior.appleOriginalTransactionId !== originalTransactionId)
        throw new Error("APPLE_TRANSACTION_CONFLICT");
      // A verified but older server response must not undo a newer paid period
      // or regrant one whose last-known status was REVOKED. The subscription
      // row lock covers BOTH the comparison and the write; the immutable event
      // and payment receipts are still de-duplicated separately below.
      const existingPayment = await tx.appSubscriptionPayment.findUnique({
        where: { appleTransactionId: transactionId },
        select: { id: true, userId: true, subscriptionId: true, appleOriginalTransactionId: true, status: true },
      });
      // Re-evaluate ownership while holding the same original-chain lock as
      // direct purchases. A concurrent new receipt/owner cannot race this write.
      const candidates = await tx.appSubscription.findMany({
        where: { provider: "APPLE", appleOriginalTransactionId: originalTransactionId },
        select: { id: true, userId: true, user: { select: { appleAppAccountToken: true } } },
      });
      if (!selectAppleSyncOwner({
        candidates, originalTransactionId, receipt: existingPayment,
        appAccountToken: transaction.appAccountToken,
        requestedUserId: subscription.userId,
        requestedSubscriptionId: subscription.id,
      })) throw new Error("APPLE_TRANSACTION_CONFLICT");
      // A refunded receipt is terminal, even if a stale server response
      // claims ACTIVE while the subscription row itself has another status.
      if (existingPayment?.status === "REFUNDED" && status === "ACTIVE")
        throw new Error("APPLE_TRANSACTION_REVOKED");
      const apply = canApplyApplePeriod(prior, { status, periodStart, periodEnd });
      if (apply) await tx.appSubscription.update({
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

      if (existingPayment && paymentStatus === "REFUNDED" && existingPayment.status === "SUCCEEDED") {
        await tx.appSubscriptionPayment.updateMany({
          where: { id: existingPayment.id, userId: subscription.userId, status: "SUCCEEDED" },
          data: { status: "REFUNDED" },
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
      // Do not tell a restore caller that an ignored, older provider response
      // reactivated the subscription. Current expiry remains authoritative.
      if (apply) return status;
      if (prior.status === "REVOKED") return "REVOKED";
      if (prior.status === "PAST_DUE") return "PAST_DUE";
      return prior.status === "ACTIVE" && prior.currentPeriodEnd && prior.currentPeriodEnd > new Date()
        ? "ACTIVE" : "EXPIRED";
    });

}


type VerifiedApplePurchase = {
  userId: string; originalTransactionId: string; transactionId: string; productId: string;
  planCode: AppSubscriptionPlanCode; periodStart: Date; periodEnd: Date;
  isRevoked: boolean; priceMilliunits: number | null; currency: string | null;
  storefront?: string; environment?: string; webOrderLineItemId?: string | number;
};
type ApplePurchaseResult =
  | { success: true }
  | { success: false; code: "APPLE_TRANSACTION_CONFLICT" | "APPLE_TRIAL_ALREADY_USED" | "APPLE_SUBSCRIPTION_INACTIVE"; error: string };
const conflict = (): ApplePurchaseResult => ({
  success: false, code: "APPLE_TRANSACTION_CONFLICT", error: "Транзакция уже привязана к другому аккаунту",
});
const inactive = (): ApplePurchaseResult => ({
  success: false, code: "APPLE_SUBSCRIPTION_INACTIVE", error: "Подписка Apple не активна",
});
const APPLE_PURCHASE_LOCK_NAMESPACE = 90210019;

/** JWS identity, account token, product and interval must be verified by caller.
 * Lock the original chain even when it has no subscription row yet. All reads,
 * idempotency, owner validation, paid-period update and receipt commit together.
 * Different original chains must not overwrite each other's period. */
export async function persistVerifiedApplePurchase(input: VerifiedApplePurchase): Promise<ApplePurchaseResult> {
  const { userId, originalTransactionId, transactionId, productId, planCode,
    periodStart, periodEnd, isRevoked, priceMilliunits, currency } = input;
  const lockKey = createHash("sha256").update(originalTransactionId).digest().readInt32BE(0);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${APPLE_PURCHASE_LOCK_NAMESPACE}::int, ${lockKey}::int)`;
    const receipt = await tx.appSubscriptionPayment.findUnique({
      where: { appleTransactionId: transactionId },
      select: { id: true, userId: true, status: true, appleOriginalTransactionId: true },
    });
    if (receipt && (receipt.userId !== userId ||
        (receipt.appleOriginalTransactionId !== null && receipt.appleOriginalTransactionId !== originalTransactionId)))
      return conflict();
    if (!receipt && priceMilliunits === 0) {
      const trial = await tx.appSubscriptionPayment.findFirst({
        where: { provider: "APPLE", appleOriginalTransactionId: originalTransactionId,
          applePriceMilliunits: 0, status: "SUCCEEDED", userId: { not: userId } },
        select: { id: true },
      });
      if (trial) return { success:false, code:"APPLE_TRIAL_ALREADY_USED", error:"Пробный период Apple уже использован" };
    }
    // Preserve the documented paid-renewal/account-transfer behavior:
    // a new verified paid transaction may be attached to its own account.
    // Existing receipt IDs and zero-price trials remain owner-fenced.
    const existing = await tx.appSubscription.findFirst({
      where: { userId, provider: "APPLE", appleOriginalTransactionId: originalTransactionId },
      select: { id: true, userId: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.userId !== userId) return conflict();
    const now = new Date();
    const status = isRevoked ? "REVOKED" : periodEnd > now ? "ACTIVE" : "EXPIRED";
    let subscriptionId: string;
    let accepted = status === "ACTIVE";
    if (existing) {
      subscriptionId = existing.id;
      // Same row lock as the Server API reconciliation path.
      await tx.$queryRaw`SELECT id FROM "AppSubscription" WHERE id=${subscriptionId} FOR UPDATE`;
      const prior = await tx.appSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { userId: true, appleOriginalTransactionId: true, status: true,
          currentPeriodStart: true, currentPeriodEnd: true },
      });
      if (prior.userId !== userId || prior.appleOriginalTransactionId !== originalTransactionId)
        return conflict();
      const canApply = canApplyApplePeriod(prior, {status,periodStart,periodEnd});
      // An already-refunded/failed receipt must not regain access from stale JWS.
      if (receipt && receipt.status !== "SUCCEEDED" && !isRevoked) return inactive();
      if (canApply && (!receipt || isRevoked)) {
        await tx.appSubscription.update({
          where: { id: subscriptionId },
          data: { status, planCode, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
            appleProductId: productId, ...(isRevoked ? {canceledAt: now} : {}) },
        });
      }
      const priorActive = prior.status === "ACTIVE" &&
        !!prior.currentPeriodEnd && prior.currentPeriodEnd > now;
      accepted = accepted && (receipt ? priorActive : canApply || priorActive);
    } else {
      // Never manufacture a new entitlement from a replay whose original
      // subscription has disappeared; restore uses authoritative server sync.
      if (receipt) return inactive();
      subscriptionId = (await tx.appSubscription.create({
        data: { userId, provider:"APPLE", status, planCode, currentPeriodStart:periodStart,
          currentPeriodEnd:periodEnd, appleOriginalTransactionId:originalTransactionId, appleProductId:productId },
        select: {id:true},
      })).id;
    }
    if (!receipt) {
      const amount = priceMilliunits === null || !Number.isFinite(priceMilliunits) || priceMilliunits < 0
        ? null : Number((priceMilliunits / 1000).toFixed(3));
      await tx.appSubscriptionPayment.create({
        data: {
          subscriptionId, userId, provider:"APPLE", kind:"INITIAL",
          status:isRevoked ? "REFUNDED" : status === "ACTIVE" ? "SUCCEEDED" : "CANCELED",
          planCode, amount, currency, periodStart, periodEnd,
          idempotenceKey:`apple:${transactionId}`, appleTransactionId:transactionId,
          appleOriginalTransactionId:originalTransactionId, applePriceMilliunits:priceMilliunits,
          appleStorefront:input.storefront ?? null, appleEnvironment:input.environment ?? null,
          appleWebOrderLineItemId:input.webOrderLineItemId != null ? String(input.webOrderLineItemId) : null,
          succeededAt:status === "ACTIVE" ? now : null,
        },
      });
    } else if (isRevoked && receipt.status === "SUCCEEDED") {
      await tx.appSubscriptionPayment.updateMany({
        where:{id:receipt.id,userId,status:"SUCCEEDED"}, data:{status:"REFUNDED"},
      });
    }
    return accepted ? {success:true} : inactive();
  });
}
