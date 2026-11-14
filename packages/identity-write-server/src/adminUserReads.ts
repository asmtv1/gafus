/**
 * Authenticated-admin composition supplies actor identity and enforces policy
 * in Core. These are narrow read projections only: writes still recheck both
 * current roles after ordered row locks in their own transaction.
 */
import { prisma } from "@gafus/prisma";

export async function readAdminUserRole(userId: string) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  return user?.role ?? null;
}

export async function readAdminUserRoles(actorId: string, targetId: string) {
  if (!actorId || !targetId) return { actorRole: null, targetRole: null };
  const [actorRole, targetRole] = await Promise.all([
    readAdminUserRole(actorId), readAdminUserRole(targetId),
  ]);
  return { actorRole, targetRole };
}

/** Privileged list: caller must authorize an administrator before invoking. */
export function readAdminUserListRows() {
  return prisma.user.findMany({
    select: {
      id: true, username: true, email: true, phone: true, role: true,
      registrationChannel: true, createdAt: true,
      profile: { select: { fullName: true, avatarUrl: true } },
      _count: { select: { pushSubscriptions: true } },
      savedRegistrationPromoCode: { select: { code: true } },
      partnerProfile: {
        select: {
          promoCodeId: true,
          promoCode: { select: { id: true, code: true, discountPercent: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
