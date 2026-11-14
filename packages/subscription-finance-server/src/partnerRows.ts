/**
 * Partner program persistence port.
 *
 * The Core application owns partner role and promo eligibility decisions,
 * attribution policy, fixed commission amounts, payout availability and
 * domain errors. This module owns all transactional SQL and query projections.
 */
import { prisma, type Prisma } from "@gafus/prisma";

export type PartnerTransaction = Prisma.TransactionClient;
export function withPartnerTransaction<T>(
  work: (tx: PartnerTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(work);
}
export function readPartnerProfileForDashboard(tx: PartnerTransaction, userId: string) {
  return tx.partnerProfile.findUnique({
    where: { userId },
    include: {
      promoCode: {
        select: { id: true, code: true, normalizedCode: true, isActive: true, archivedAt: true },
      },
      user: { select: { role: true } },
    },
  });
}
export async function lockPartnerAccount(tx: PartnerTransaction, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}
export function readPartnerUserRole(tx: PartnerTransaction, userId: string) {
  return tx.user.findUnique({ where: { id: userId }, select: { role: true } });
}
export async function lockPartnerBinding(
  tx: PartnerTransaction,
  userId: string,
  promoCodeId: string,
) {
  // Lock order and names must match the admin binding/attribution operations.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-user:${userId}`}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-promo:${promoCodeId}`}))`;
}
export function readPartnerProfileBinding(tx: PartnerTransaction, userId: string) {
  return tx.partnerProfile.findUnique({
    where: { userId },
    include: { promoCode: true },
  });
}
export function readPartnerPromoById(tx: PartnerTransaction, promoCodeId: string) {
  return tx.appSubscriptionPromoCode.findUnique({ where: { id: promoCodeId } });
}
export function updatePartnerPromoIfMissing(
  tx: PartnerTransaction,
  userId: string,
  promoCodeId: string,
) {
  return tx.partnerProfile.updateMany({
    where: { userId, promoCodeId: null },
    data: { promoCodeId },
  });
}
export function createPartnerProfileIfMissing(
  tx: PartnerTransaction,
  userId: string,
  promoCodeId: string,
) {
  return tx.partnerProfile.createMany({
    data: { userId, promoCodeId },
    skipDuplicates: true,
  });
}
export function readPartnerProfileBoundOrThrow(tx: PartnerTransaction, userId: string) {
  return tx.partnerProfile.findUniqueOrThrow({
    where: { userId },
    include: { promoCode: true },
  });
}
export function readPromoIdByNormalizedCode(tx: PartnerTransaction, normalizedCode: string) {
  return tx.appSubscriptionPromoCode.findUnique({
    where: { normalizedCode },
    select: { id: true },
  });
}
export function readPartnerForPromoAttribution(tx: PartnerTransaction, promoCodeId: string) {
  return tx.partnerProfile.findUnique({
    where: { promoCodeId },
    include: { promoCode: true, user: { select: { role: true } } },
  });
}
export function createPartnerReferralOnce(
  tx: PartnerTransaction,
  partnerId: string,
  buyerId: string,
) {
  return tx.partnerReferral.createMany({
    data: { partnerId, buyerId },
    skipDuplicates: true,
  });
}
export function readPartnerReferral(tx: PartnerTransaction, buyerId: string) {
  return tx.partnerReferral.findUnique({ where: { buyerId } });
}
export function readPartnerReferralId(tx: PartnerTransaction, buyerId: string) {
  return tx.partnerReferral.findUnique({
    where: { buyerId },
    select: { partnerId: true },
  });
}
export function readPartnerReferralRequired(tx: PartnerTransaction, buyerId: string) {
  return tx.partnerReferral.findUniqueOrThrow({ where: { buyerId } });
}
export function readOriginalPaymentPromo(tx: PartnerTransaction, subscriptionId: string) {
  return tx.appSubscriptionPayment.findFirst({
    where: {
      subscriptionId,
      provider: "YOOKASSA",
      kind: "INITIAL",
      status: "SUCCEEDED",
      promoCodeId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { promoCodeId: true },
  });
}
export function readPartnerIdByPromo(tx: PartnerTransaction, promoCodeId: string) {
  return tx.partnerProfile.findUnique({
    where: { promoCodeId },
    select: { id: true },
  });
}
export function createPartnerCommission(
  tx: PartnerTransaction,
  input: { partnerId: string; paymentId: string; amountKopecks: number },
) {
  return tx.partnerCommission.create({
    data: { ...input, kind: "EARNED" },
  });
}
export async function readEarnedPartnerCommission(tx: PartnerTransaction, paymentId: string) {
  // Pre-migration test doubles may omit this model; preserve the existing
  // null behavior while production transactions always have the repository.
  const delegate = (tx as Partial<PartnerTransaction>).partnerCommission;
  if (!delegate) return null;
  return delegate.findUnique({
    where: { paymentId_kind: { paymentId, kind: "EARNED" } },
    select: { partnerId: true, amountKopecks: true },
  });
}
export async function createPartnerRefundAdjustment(
  tx: PartnerTransaction,
  input: { partnerId: string; paymentId: string; amountKopecks: number },
) {
  const delegate = (tx as Partial<PartnerTransaction>).partnerCommission;
  if (!delegate) return null;
  return delegate.create({
    data: { ...input, kind: "REFUND_ADJUSTMENT" },
  });
}
export async function readPartnerDashboardTotals(partnerId: string) {
  const [commission, payouts, referrals] = await Promise.all([
    prisma.partnerCommission.aggregate({
      where: { partnerId },
      _sum: { amountKopecks: true },
    }),
    prisma.partnerPayout.aggregate({
      where: { partnerId, status: { in: ["PENDING", "PAID"] } },
      _sum: { amountKopecks: true },
    }),
    prisma.partnerReferral.count({ where: { partnerId } }),
  ]);
  return {
    earnedKopecks: commission._sum.amountKopecks ?? 0,
    reservedKopecks: payouts._sum.amountKopecks ?? 0,
    referrals,
  };
}
export async function lockPartnerPayout(tx: PartnerTransaction, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-payout:${userId}`}))`;
}
export async function readPartnerPayoutTotals(tx: PartnerTransaction, partnerId: string) {
  const [commission, payouts] = await Promise.all([
    tx.partnerCommission.aggregate({
      where: { partnerId },
      _sum: { amountKopecks: true },
    }),
    tx.partnerPayout.aggregate({
      where: { partnerId, status: { in: ["PENDING", "PAID"] } },
      _sum: { amountKopecks: true },
    }),
  ]);
  return {
    earnedKopecks: commission._sum.amountKopecks ?? 0,
    reservedKopecks: payouts._sum.amountKopecks ?? 0,
  };
}
export function createPartnerPayout(
  tx: PartnerTransaction,
  partnerId: string,
  amountKopecks: number,
) {
  return tx.partnerPayout.create({ data: { partnerId, amountKopecks } });
}
