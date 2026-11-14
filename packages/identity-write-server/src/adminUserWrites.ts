/**
 * Atomic administrative account mutations. The Core caller supplies *pure*
 * role/partner authorization, checked here only after ordered DB row locks.
 * Partner binding and media deletion intent are callbacks invoked with this
 * same transaction: no mail/CDN/queue network operations may occur inside.
 */
import { prisma, type Prisma, type UserRole } from "@gafus/prisma";

export type AdminRole = UserRole | null;
export type AdminUserTx = Prisma.TransactionClient;
export interface AdminUserUpdateRowsInput {
  username?: string;
  email?: string | null;
  phone?: string;
  role?: UserRole;
  passwordHash?: string;
  partnerPromoCodeId?: string;
}
export interface AdminUserUpdateCallbacks {
  authorize: (actorRole: AdminRole, targetRole: AdminRole) => void;
  bindPartner: (tx: AdminUserTx, userId: string, promoCodeId: string) => Promise<unknown>;
}

export async function updateAdminUserRows(
  userId: string, input: AdminUserUpdateRowsInput, actorId: string | undefined,
  callbacks: AdminUserUpdateCallbacks,
): Promise<void> {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  const data: Prisma.UserUpdateInput = {};
  if (input.username !== undefined) data.username = input.username;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.role !== undefined) data.role = input.role;
  if (input.passwordHash !== undefined) data.password = input.passwordHash;

  await prisma.$transaction(async tx => {
    if (actorId) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${userId}) ORDER BY "id" FOR UPDATE`;
      const [actor, target] = await Promise.all([
        tx.user.findUnique({ where: { id: actorId }, select: { role: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
      ]);
      callbacks.authorize(actor?.role ?? null, target?.role ?? null);
    } else callbacks.authorize(null, null);

    const securityChange = input.role !== undefined || input.passwordHash !== undefined;
    const revokedAt = securityChange ? new Date() : null;
    await tx.user.update({
      where: { id: userId },
      data: revokedAt ? { ...data, sessionsRevokedAt: revokedAt } : data,
    });
    if (revokedAt) {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null }, data: { revokedAt },
      });
    }
    if (input.partnerPromoCodeId !== undefined) {
      await callbacks.bindPartner(tx, userId, input.partnerPromoCodeId);
    }
  });
}

export async function deleteAdminUserRows(
  userId: string, actorId: string,
  authorize: (actorRole: AdminRole, targetRole: AdminRole) => void,
  enqueueCleanup: (tx: AdminUserTx, userId: string, at: Date) => Promise<unknown>,
): Promise<void> {
  if (!userId || !actorId || actorId === userId) throw new Error("ADMIN_DELETE_SELF_OR_MISSING_ACTOR");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${userId}) ORDER BY "id" FOR UPDATE`;
    const [actor, target] = await Promise.all([
      tx.user.findUnique({ where: { id: actorId }, select: { role: true } }),
      tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ]);
    authorize(actor?.role ?? null, target?.role ?? null);
    await enqueueCleanup(tx, userId, new Date());
    await tx.user.delete({ where: { id: userId } });
  });
}

/** Partner binding participates in the admin role-change transaction. */
export { bindPartnerPromoCodeInTransaction } from "@gafus/subscription-payment-server/partner";
