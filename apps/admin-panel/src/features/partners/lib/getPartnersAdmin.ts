/* eslint-disable @typescript-eslint/no-explicit-any, max-len */
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

type PartnerProfileRecord = any;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");
}

function rub(kopecks: number) {
  return Math.round(kopecks) / 100;
}

function summarize(profile: PartnerProfileRecord) {
  const earned = profile.commissions.reduce((sum: number, row: any) => sum + row.amountKopecks, 0);
  const reserved = profile.payouts
    .filter((row: any) => row.status === "PENDING" || row.status === "PAID")
    .reduce((sum: number, row: any) => sum + row.amountKopecks, 0);
  return {
    id: profile.id,
    userId: profile.user.id,
    username: profile.user.username,
    fullName: profile.user.profile?.fullName ?? null,
    email: profile.user.email,
    isActive: profile.isActive,
    referralCode: profile.referralCode,
    referrals: profile.referrals.length,
    earnedKopecks: earned,
    reservedKopecks: reserved,
    availableKopecks: earned - reserved,
    earnedRub: rub(earned),
    reservedRub: rub(reserved),
    availableRub: rub(earned - reserved),
  };
}

const include = {
  user: { select: { id: true, username: true, email: true, profile: { select: { fullName: true } } } },
  referrals: { select: { id: true, buyerId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  commissions: { select: { id: true, amountKopecks: true, kind: true, paymentId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  payouts: { select: { id: true, amountKopecks: true, status: true, requestedAt: true, processedAt: true, note: true }, orderBy: { requestedAt: "desc" } },
};

export async function getPartnersAdmin() {
  await requireAdmin();
  const profiles = await (prisma as any).partnerProfile.findMany({ include });
  return profiles.map(summarize).sort((a: any, b: any) => b.availableKopecks - a.availableKopecks);
}

export async function getPartnerAdminDetail(id: string) {
  await requireAdmin();
  const profile = await (prisma as any).partnerProfile.findUnique({ where: { id }, include });
  if (!profile) return null;
  return { ...summarize(profile), referrals: profile.referrals, commissions: profile.commissions, payouts: profile.payouts };
}

export { requireAdmin };
