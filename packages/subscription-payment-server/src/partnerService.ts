import {
  withPartnerTransaction,
  readPartnerProfileForDashboard,
  lockPartnerAccount,
  readPartnerUserRole,
  lockPartnerBinding,
  readPartnerProfileBinding,
  readPartnerPromoById,
  updatePartnerPromoIfMissing,
  readPartnerProfileBoundOrThrow,
  createPartnerProfileIfMissing,
  readPromoIdByNormalizedCode,
  readPartnerForPromoAttribution,
  createPartnerReferralOnce,
  readPartnerReferral,
  readPartnerReferralId,
  readPartnerReferralRequired,
  readOriginalPaymentPromo,
  readPartnerIdByPromo,
  createPartnerCommission,
  readEarnedPartnerCommission,
  createPartnerRefundAdjustment,
  readPartnerDashboardTotals,
  lockPartnerPayout,
  readPartnerPayoutTotals,
  createPartnerPayout,
  type PartnerTransaction,
} from "@gafus/subscription-finance-server/partner-rows";

import { parseAppSubscriptionPromoCode } from "./promoCode";

export const PARTNER_COMMISSION_KOPECKS = 25_000;
export const THREE_MONTH_PARTNER_COMMISSION_KOPECKS = 75_000;

export function partnerCommissionKopecksForPlan(planCode: unknown): number {
  if (planCode === "TWO_WEEKS") return 0;
  if (planCode === "THREE_MONTHS") return THREE_MONTH_PARTNER_COMMISSION_KOPECKS;
  return planCode === "MONTHLY" ? PARTNER_COMMISSION_KOPECKS : 0;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export class PartnerProgramError extends Error {
  constructor(
    public readonly code:
      | "PARTNER_REQUIRED"
      | "PARTNER_PROMO_REQUIRED"
      | "PARTNER_PROMO_UNAVAILABLE"
      | "REFERRAL_INVALID"
      | "REFERRAL_SELF"
      | "REFERRAL_ALREADY_SET"
      | "PAYOUT_AMOUNT_INVALID"
      | "PAYOUT_BALANCE_INSUFFICIENT",
  ) {
    super(code);
  }
}

async function getPartnerProfileInTransaction(tx: PartnerTransaction, userId: string) {
  const profile = await readPartnerProfileForDashboard(tx, userId);
  if (!profile || profile.user.role !== "PARTNER") {
    throw new PartnerProgramError("PARTNER_REQUIRED");
  }
  return profile;
}

/** New partners must be assigned an existing active, non-archived promo code by an admin. */
export async function bindPartnerPromoCodeInTransaction(
  tx: PartnerTransaction,
  params: { userId: string; promoCodeId: string },
) {
  // Lock the account row before reading its role, so a concurrent demotion
  // cannot race attribution/binding past the current-role check.
  await lockPartnerAccount(tx, params.userId);
  const user = await readPartnerUserRole(tx, params.userId);
  if (user?.role !== "PARTNER") throw new PartnerProgramError("PARTNER_REQUIRED");

  // Serialize every binding that competes for either this user or this promo.
  // Without these transaction-scoped locks, an update of a legacy null binding
  // can raise P2002 after another transaction takes the promo, which aborts a
  // PostgreSQL transaction before we can return a coherent domain error.
  await lockPartnerBinding(tx, params.userId, params.promoCodeId);

  const profile = await readPartnerProfileBinding(tx, params.userId);
  // A bound partner code is historical identity, not an editable setting. In
  // particular, do not revalidate its activity while an admin edits another
  // user field: deactivated codes must remain readable on legacy profiles.
  if (profile?.promoCodeId) {
    if (profile.promoCodeId !== params.promoCodeId)
      throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");
    return profile;
  }

  const promoCode = await readPartnerPromoById(tx, params.promoCodeId);
  if (!promoCode || promoCode.archivedAt || !promoCode.isActive)
    throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");

  // A legacy profile is deliberately allowed to receive its first real promo.
  // The null predicate makes that transition conditional, so it cannot replace
  // a value installed by a concurrent admin request.
  if (profile) {
    const updated = await updatePartnerPromoIfMissing(tx, params.userId, promoCode.id);
    if (updated.count === 1) {
      return readPartnerProfileBoundOrThrow(tx, params.userId);
    }
  } else {
    const created = await createPartnerProfileIfMissing(tx, params.userId, promoCode.id);
    if (created.count === 1) {
      return readPartnerProfileBoundOrThrow(tx, params.userId);
    }
  }

  // A uniqueness collision is expected under concurrent assignment. Re-read
  // the profile and return only the idempotent same-code outcome; never leak a
  // Prisma P2002 or overwrite an already bound code.
  const currentProfile = await readPartnerProfileBinding(tx, params.userId);
  if (currentProfile?.promoCodeId === promoCode.id) return currentProfile;
  throw new PartnerProgramError("PARTNER_PROMO_UNAVAILABLE");
}

export async function bindPartnerPromoCode(params: { userId: string; promoCodeId: string }) {
  return withPartnerTransaction((tx) => bindPartnerPromoCodeInTransaction(tx, params));
}

/** Legacy profiles without a bound promo remain readable but cannot issue new referrals. */
export async function getPartnerProfile(userId: string) {
  return withPartnerTransaction((tx) => getPartnerProfileInTransaction(tx, userId));
}

export async function attributePartnerReferralInTransaction(
  tx: PartnerTransaction,
  buyerId: string,
  rawCode: unknown,
) {
  const identity = parseAppSubscriptionPromoCode(rawCode);
  if (!identity) throw new PartnerProgramError("REFERRAL_INVALID");
  const promoCode = await readPromoIdByNormalizedCode(tx, identity.normalizedCode);
  if (!promoCode) throw new PartnerProgramError("REFERRAL_INVALID");
  const partner = await readPartnerForPromoAttribution(tx, promoCode.id);
  if (
    !partner?.isActive ||
    partner.user.role !== "PARTNER" ||
    !partner.promoCode ||
    !partner.promoCode.isActive ||
    partner.promoCode.archivedAt
  ) {
    throw new PartnerProgramError("REFERRAL_INVALID");
  }
  if (partner.userId === buyerId) throw new PartnerProgramError("REFERRAL_SELF");
  const created = await createPartnerReferralOnce(tx, partner.id, buyerId);
  if (created.count === 1) return readPartnerReferralRequired(tx, buyerId);
  const existing = await readPartnerReferral(tx, buyerId);
  if (existing?.partnerId === partner.id) return existing;
  throw new PartnerProgramError("REFERRAL_ALREADY_SET");
}

/** Registration path: a valid ordinary promo is saved, but only a current partner's
 * bound promo receives attribution. A non-partner promo is intentionally not an error. */
export async function attributePartnerReferralIfCurrentPartnerInTransaction(
  tx: PartnerTransaction,
  buyerId: string,
  normalizedPromoCode: string,
) {
  const promoCode = await readPromoIdByNormalizedCode(tx, normalizedPromoCode);
  if (!promoCode) return null;
  const partner = await readPartnerForPromoAttribution(tx, promoCode.id);
  if (
    !partner?.isActive ||
    partner.user.role !== "PARTNER" ||
    !partner.promoCode ||
    !partner.promoCode.isActive ||
    partner.promoCode.archivedAt
  )
    return null;
  if (partner.userId === buyerId) throw new PartnerProgramError("REFERRAL_SELF");
  const created = await createPartnerReferralOnce(tx, partner.id, buyerId);
  if (created.count === 1) return readPartnerReferralRequired(tx, buyerId);
  const existing = await readPartnerReferral(tx, buyerId);
  if (existing?.partnerId === partner.id) return existing;
  throw new PartnerProgramError("REFERRAL_ALREADY_SET");
}

export async function attributePartnerReferral(buyerId: string, rawCode: string) {
  return withPartnerTransaction((tx) =>
    attributePartnerReferralInTransaction(tx, buyerId, rawCode),
  );
}

/** Called inside the payment-success transaction. The unique ledger key makes retries harmless. */
export async function recordPartnerCommissionForPayment(
  tx: PartnerTransaction,
  payment: {
    id: string;
    userId: string;
    planCode: unknown;
    subscriptionId?: string | null;
    promoCodeId?: string | null;
    kind?: string;
  },
) {
  const amountKopecks = partnerCommissionKopecksForPlan(payment.planCode);
  if (amountKopecks === 0) return null;
  let promoCodeId = payment.promoCodeId;
  if (!promoCodeId && payment.kind === "RENEWAL" && payment.subscriptionId) {
    const initialPayment = await readOriginalPaymentPromo(tx, payment.subscriptionId);
    promoCodeId = initialPayment?.promoCodeId;
  }

  const partner = promoCodeId ? await readPartnerIdByPromo(tx, promoCodeId) : null;
  if (partner && payment.kind !== "RENEWAL") {
    await createPartnerReferralOnce(tx, partner.id, payment.userId);
  }
  const referral = partner ? null : await readPartnerReferralId(tx, payment.userId);
  const partnerId = partner?.id ?? referral?.partnerId;
  if (!partnerId) return null;
  try {
    return await createPartnerCommission(tx, { partnerId, paymentId: payment.id, amountKopecks });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Called only after a provider-verified full refund. */
export async function reversePartnerCommissionForRefund(
  tx: PartnerTransaction,
  payment: { id: string },
) {
  const earned = await readEarnedPartnerCommission(tx, payment.id);
  if (!earned) return null;
  try {
    return await createPartnerRefundAdjustment(tx, {
      partnerId: earned.partnerId,
      paymentId: payment.id,
      amountKopecks: -earned.amountKopecks,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export async function getPartnerDashboard(userId: string) {
  const profile = await getPartnerProfile(userId);
  if (!profile.promoCode) throw new PartnerProgramError("PARTNER_PROMO_REQUIRED");
  const { earnedKopecks, reservedKopecks, referrals } = await readPartnerDashboardTotals(
    profile.id,
  );

  return {
    referralCode: profile.promoCode.code,
    referrals,
    earnedKopecks,
    reservedKopecks,
    availableKopecks: earnedKopecks - reservedKopecks,
  };
}

export async function requestPartnerPayout(userId: string, amountKopecks: number) {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0)
    throw new PartnerProgramError("PAYOUT_AMOUNT_INVALID");
  return withPartnerTransaction(async (tx) => {
    // The balance check and reservation must share one serialization point. Without
    // it, two concurrent requests can both spend the same available commission.
    await lockPartnerPayout(tx, userId);
    const profile = await getPartnerProfileInTransaction(tx, userId);
    const { earnedKopecks, reservedKopecks } = await readPartnerPayoutTotals(tx, profile.id);
    const availableKopecks = earnedKopecks - reservedKopecks;
    if (amountKopecks > availableKopecks) {
      throw new PartnerProgramError("PAYOUT_BALANCE_INSUFFICIENT");
    }
    return createPartnerPayout(tx, profile.id, amountKopecks);
  });
}
