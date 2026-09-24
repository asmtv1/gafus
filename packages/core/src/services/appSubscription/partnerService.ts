import { prisma, type Prisma } from "@gafus/prisma";

import { parseAppSubscriptionPromoCode } from "./promoCode";

export const PARTNER_COMMISSION_KOPECKS = 25_000;
export const THREE_MONTH_PARTNER_COMMISSION_KOPECKS = PARTNER_COMMISSION_KOPECKS * 3;

export function partnerCommissionKopecksForPlan(planCode: unknown): number {
  if (planCode === "TWO_WEEKS") return 0;
  return planCode === "THREE_MONTHS"
    ? THREE_MONTH_PARTNER_COMMISSION_KOPECKS
    : PARTNER_COMMISSION_KOPECKS;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export class PartnerProgramError extends Error {
  constructor(public readonly code: "PARTNER_REQUIRED" | "PARTNER_PROMO_REQUIRED" | "PARTNER_PROMO_UNAVAILABLE" | "REFERRAL_INVALID" | "REFERRAL_SELF" | "REFERRAL_ALREADY_SET" | "PAYOUT_AMOUNT_INVALID" | "PAYOUT_BALANCE_INSUFFICIENT") {
    super(code);
  }
}

async function getPartnerProfileInTransaction(tx: Prisma.TransactionClient, userId: string) {
  const profile = await tx.partnerProfile.findUnique({
    where: { userId },
    include: {
      promoCode: {
        select: { id: true, code: true, normalizedCode: true, isActive: true, archivedAt: true },
      },
      user: { select: { role: true } },
    },
  });
  if (!profile || profile.user.role !== "PARTNER") {
    throw new PartnerProgramError("PARTNER_REQUIRED");
  }
  return profile;
}

/** New partners must be assigned an existing active, non-archived promo code by an admin. */
export async function bindPartnerPromoCodeInTransaction(
  tx: Prisma.TransactionClient,
  params: { userId: string; promoCodeId: string },
) {
  // Lock the account row before reading its role, so a concurrent demotion
  // cannot race attribution/binding past the current-role check.
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${params.userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: params.userId }, select: { role: true } });
  if (user?.role !== "PARTNER") throw new PartnerProgramError("PARTNER_REQUIRED");

  // Serialize every binding that competes for either this user or this promo.
  // Without these transaction-scoped locks, an update of a legacy null binding
  // can raise P2002 after another transaction takes the promo, which aborts a
  // PostgreSQL transaction before we can return a coherent domain error.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-user:${params.userId}`}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-promo:${params.promoCodeId}`}))`;

  const profile = await tx.partnerProfile.findUnique({
    where: { userId: params.userId },
    include: { promoCode: true },
  });
  // A bound partner code is historical identity, not an editable setting. In
  // particular, do not revalidate its activity while an admin edits another
  // user field: deactivated codes must remain readable on legacy profiles.
  if (profile?.promoCodeId) {
    if (profile.promoCodeId !== params.promoCodeId) throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");
    return profile;
  }

  const promoCode = await tx.appSubscriptionPromoCode.findUnique({ where: { id: params.promoCodeId } });
  if (!promoCode || promoCode.archivedAt || !promoCode.isActive) throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");

  // A legacy profile is deliberately allowed to receive its first real promo.
  // The null predicate makes that transition conditional, so it cannot replace
  // a value installed by a concurrent admin request.
  if (profile) {
    const updated = await tx.partnerProfile.updateMany({
      where: { userId: params.userId, promoCodeId: null },
      data: { promoCodeId: promoCode.id },
    });
    if (updated.count === 1) {
      return tx.partnerProfile.findUniqueOrThrow({ where: { userId: params.userId }, include: { promoCode: true } });
    }
  } else {
    const created = await tx.partnerProfile.createMany({
      data: { userId: params.userId, promoCodeId: promoCode.id },
      skipDuplicates: true,
    });
    if (created.count === 1) {
      return tx.partnerProfile.findUniqueOrThrow({ where: { userId: params.userId }, include: { promoCode: true } });
    }
  }

  // A uniqueness collision is expected under concurrent assignment. Re-read
  // the profile and return only the idempotent same-code outcome; never leak a
  // Prisma P2002 or overwrite an already bound code.
  const currentProfile = await tx.partnerProfile.findUnique({
    where: { userId: params.userId },
    include: { promoCode: true },
  });
  if (currentProfile?.promoCodeId === promoCode.id) return currentProfile;
  throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");
}

export async function bindPartnerPromoCode(params: { userId: string; promoCodeId: string }) {
  return prisma.$transaction((tx) => bindPartnerPromoCodeInTransaction(tx, params));
}

/** Legacy profiles without a bound promo remain readable but cannot issue new referrals. */
export async function getPartnerProfile(userId: string) {
  return prisma.$transaction((tx) => getPartnerProfileInTransaction(tx, userId));
}

export async function attributePartnerReferralInTransaction(
  tx: Prisma.TransactionClient,
  buyerId: string,
  rawCode: unknown,
) {
  const identity = parseAppSubscriptionPromoCode(rawCode);
  if (!identity) throw new PartnerProgramError("REFERRAL_INVALID");
  const promoCode = await tx.appSubscriptionPromoCode.findUnique({ where: { normalizedCode: identity.normalizedCode }, select: { id: true } });
  if (!promoCode) throw new PartnerProgramError("REFERRAL_INVALID");
  const partner = await tx.partnerProfile.findUnique({
    where: { promoCodeId: promoCode.id },
    include: { promoCode: true, user: { select: { role: true } } },
  });
  if (!partner?.isActive || partner.user.role !== "PARTNER" || !partner.promoCode || !partner.promoCode.isActive || partner.promoCode.archivedAt) {
    throw new PartnerProgramError("REFERRAL_INVALID");
  }
  if (partner.userId === buyerId) throw new PartnerProgramError("REFERRAL_SELF");
  const created = await tx.partnerReferral.createMany({ data: { partnerId: partner.id, buyerId }, skipDuplicates: true });
  if (created.count === 1) return tx.partnerReferral.findUniqueOrThrow({ where: { buyerId } });
  const existing = await tx.partnerReferral.findUnique({ where: { buyerId } });
  if (existing?.partnerId === partner.id) return existing;
  throw new PartnerProgramError("REFERRAL_ALREADY_SET");
}

/** Registration path: a valid ordinary promo is saved, but only a current partner's
 * bound promo receives attribution. A non-partner promo is intentionally not an error. */
export async function attributePartnerReferralIfCurrentPartnerInTransaction(
  tx: Prisma.TransactionClient,
  buyerId: string,
  normalizedPromoCode: string,
) {
  const promoCode = await tx.appSubscriptionPromoCode.findUnique({ where: { normalizedCode: normalizedPromoCode }, select: { id: true } });
  if (!promoCode) return null;
  const partner = await tx.partnerProfile.findUnique({
    where: { promoCodeId: promoCode.id },
    include: { promoCode: true, user: { select: { role: true } } },
  });
  if (!partner?.isActive || partner.user.role !== "PARTNER" || !partner.promoCode || !partner.promoCode.isActive || partner.promoCode.archivedAt) return null;
  if (partner.userId === buyerId) throw new PartnerProgramError("REFERRAL_SELF");
  const created = await tx.partnerReferral.createMany({ data: { partnerId: partner.id, buyerId }, skipDuplicates: true });
  if (created.count === 1) return tx.partnerReferral.findUniqueOrThrow({ where: { buyerId } });
  const existing = await tx.partnerReferral.findUnique({ where: { buyerId } });
  if (existing?.partnerId === partner.id) return existing;
  throw new PartnerProgramError("REFERRAL_ALREADY_SET");
}

export async function attributePartnerReferral(buyerId: string, rawCode: string) {
  return prisma.$transaction((tx) => attributePartnerReferralInTransaction(tx, buyerId, rawCode));
}

/** Called inside the payment-success transaction. The unique ledger key makes retries harmless. */
export async function recordPartnerCommissionForPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; userId: string; planCode: unknown },
) {
  const partnerReferral = (tx as Partial<Prisma.TransactionClient>).partnerReferral;
  const partnerCommission = (tx as Partial<Prisma.TransactionClient>).partnerCommission;
  if (!partnerReferral || !partnerCommission) return null;
  const amountKopecks = partnerCommissionKopecksForPlan(payment.planCode);
  if (amountKopecks === 0) return null;
  const referral = await partnerReferral.findUnique({ where: { buyerId: payment.userId }, select: { partnerId: true } });
  if (!referral) return null;
  try {
    return await partnerCommission.create({
      data: {
        partnerId: referral.partnerId,
        paymentId: payment.id,
        amountKopecks,
        kind: "EARNED",
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Called only after a provider-verified full refund. */
export async function reversePartnerCommissionForRefund(tx: Prisma.TransactionClient, payment: { id: string }) {
  const partnerCommission = (tx as Partial<Prisma.TransactionClient>).partnerCommission;
  if (!partnerCommission) return null;
  const earned = await partnerCommission.findUnique({
    where: { paymentId_kind: { paymentId: payment.id, kind: "EARNED" } },
    select: { partnerId: true, amountKopecks: true },
  });
  if (!earned) return null;
  try {
    return await partnerCommission.create({
      data: {
        partnerId: earned.partnerId,
        paymentId: payment.id,
        amountKopecks: -earned.amountKopecks,
        kind: "REFUND_ADJUSTMENT",
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export async function getPartnerDashboard(userId: string) {
  const profile = await getPartnerProfile(userId);
  if (!profile.promoCode) throw new PartnerProgramError("PARTNER_PROMO_REQUIRED");
  const [commission, payouts, referrals] = await Promise.all([
    prisma.partnerCommission.aggregate({ where: { partnerId: profile.id }, _sum: { amountKopecks: true } }),
    prisma.partnerPayout.aggregate({ where: { partnerId: profile.id, status: { in: ["PENDING", "PAID"] } }, _sum: { amountKopecks: true } }),
    prisma.partnerReferral.count({ where: { partnerId: profile.id } }),
  ]);
  const earnedKopecks = commission._sum.amountKopecks ?? 0;
  const reservedKopecks = payouts._sum.amountKopecks ?? 0;
  return { referralCode: profile.promoCode.code, referrals, earnedKopecks, reservedKopecks, availableKopecks: earnedKopecks - reservedKopecks };
}

export async function requestPartnerPayout(userId: string, amountKopecks: number) {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) throw new PartnerProgramError("PAYOUT_AMOUNT_INVALID");
  return prisma.$transaction(async (tx) => {
    // The balance check and reservation must share one serialization point. Without
    // it, two concurrent requests can both spend the same available commission.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-payout:${userId}`}))`;
    const profile = await getPartnerProfileInTransaction(tx, userId);
    const [commission, payouts] = await Promise.all([
      tx.partnerCommission.aggregate({
        where: { partnerId: profile.id },
        _sum: { amountKopecks: true },
      }),
      tx.partnerPayout.aggregate({
        where: { partnerId: profile.id, status: { in: ["PENDING", "PAID"] } },
        _sum: { amountKopecks: true },
      }),
    ]);
    const availableKopecks =
      (commission._sum.amountKopecks ?? 0) - (payouts._sum.amountKopecks ?? 0);
    if (amountKopecks > availableKopecks) {
      throw new PartnerProgramError("PAYOUT_BALANCE_INSUFFICIENT");
    }
    return tx.partnerPayout.create({ data: { partnerId: profile.id, amountKopecks } });
  });
}
