import { prisma, type Prisma } from "@gafus/prisma";

/**
 * Admin partner balances. Applications supply an actor ID; the core checks
 * the current database role before returning financial and referral details.
 */
const partnerAdminInclude = {
  user: { select: { id: true, username: true, email: true, profile: { select: { fullName: true } } } },
  promoCode: { select: { code: true } },
  referrals: { select: { id: true, buyerId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  commissions: { select: { id: true, amountKopecks: true, kind: true, paymentId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  payouts: { select: { id: true, amountKopecks: true, status: true, requestedAt: true, processedAt: true, note: true }, orderBy: { requestedAt: "desc" } },
} as const satisfies Prisma.PartnerProfileInclude;

type PartnerAdminRecord = Prisma.PartnerProfileGetPayload<{ include: typeof partnerAdminInclude }>;

function rub(kopecks: number): number {
  return Math.round(kopecks) / 100;
}

function summarize(profile: PartnerAdminRecord) {
  const earned = profile.commissions.reduce((sum, row) => sum + row.amountKopecks, 0);
  const reserved = profile.payouts
    .filter(row => row.status === "PENDING" || row.status === "PAID")
    .reduce((sum, row) => sum + row.amountKopecks, 0);
  return {
    id: profile.id,
    userId: profile.user.id,
    username: profile.user.username,
    fullName: profile.user.profile?.fullName ?? null,
    email: profile.user.email,
    isActive: profile.isActive,
    referralCode: profile.promoCode?.code ?? profile.referralCode,
    referrals: profile.referrals.length,
    earnedKopecks: earned,
    reservedKopecks: reserved,
    availableKopecks: earned - reserved,
    earnedRub: rub(earned),
    reservedRub: rub(reserved),
    availableRub: rub(earned - reserved),
  };
}

/** Admin-panel user editor may show free codes to ADMIN and MODERATOR. */
export async function getFreePartnerPromoCodesForAdminPanel(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  if (actor?.role !== "ADMIN" && actor?.role !== "MODERATOR") throw new Error("FORBIDDEN");
  return prisma.appSubscriptionPromoCode.findMany({
    where: { isActive: true, archivedAt: null, partnerProfile: null },
    select: { id: true, code: true, discountPercent: true },
    orderBy: { code: "asc" },
  });
}

async function assertAdminActor(actorId: string): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
}

export async function listPartnerAdminBalances(actorId: string) {
  await assertAdminActor(actorId);
  const profiles = await prisma.partnerProfile.findMany({ include: partnerAdminInclude });
  return profiles.map(summarize).sort((a, b) => b.availableKopecks - a.availableKopecks);
}

export async function getPartnerAdminBalanceDetail(actorId: string, partnerId: string) {
  await assertAdminActor(actorId);
  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    include: partnerAdminInclude,
  });
  if (!profile) return null;
  return {
    ...summarize(profile),
    referrals: profile.referrals,
    commissions: profile.commissions,
    payouts: profile.payouts,
  };
}

/**
 * Mark the currently available amount as paid. This transaction shares the
 * same partner-payout:userId advisory lock as requestPartnerPayout, so a
 * concurrent self-service request and an admin payout cannot reserve twice.
 */
export async function markPartnerBalancePaidAdmin(input: {
  actorId: string;
  partnerId: string;
}) {
  return prisma.$transaction(async tx => {
    // Protect the authorization decision against a concurrent role change.
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${input.actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN") {
      return { success: false as const, error: "Недостаточно прав" };
    }

    const partner = await tx.partnerProfile.findUnique({
      where: { id: input.partnerId },
      select: { userId: true },
    });
    if (!partner) return { success: false as const, error: "Партнёр не найден" };

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-payout:${partner.userId}`}))`;
    const [earned, paidOrPending] = await Promise.all([
      tx.partnerCommission.aggregate({
        where: { partnerId: input.partnerId },
        _sum: { amountKopecks: true },
      }),
      tx.partnerPayout.aggregate({
        where: { partnerId: input.partnerId, status: { in: ["PENDING", "PAID"] } },
        _sum: { amountKopecks: true },
      }),
    ]);
    const availableKopecks =
      (earned._sum.amountKopecks ?? 0) - (paidOrPending._sum.amountKopecks ?? 0);
    if (availableKopecks <= 0) {
      return { success: false as const, error: "Доступный баланс уже выплачен или отсутствует" };
    }

    const payout = await tx.partnerPayout.create({
      data: {
        partnerId: input.partnerId,
        amountKopecks: availableKopecks,
        status: "PAID",
        processedAt: new Date(),
        note: `Выплата отмечена администратором ${input.actorId}`,
      },
    });
    return {
      success: true as const,
      payoutId: payout.id,
      amountKopecks: availableKopecks,
    };
  });
}
