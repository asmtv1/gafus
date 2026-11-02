import bcryptjs from "bcryptjs";
import { enqueueAccountStorageCleanup } from "../accountCleanup/enqueue";

import { prisma } from "@gafus/prisma";
import type { UserRole } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { bindPartnerPromoCodeInTransaction } from "../appSubscription/partnerService";

import { handlePrismaError } from "../../errors/prismaErrorHandler";
import { ServiceError } from "../../errors/ServiceError";
import type {
  AdminUserRow,
  AdminUserActionResult,
  AdminUserDeleteResult,
  AdminUserUpdateResult,
  UpdateUserAdminInput,
} from "./types";

const logger = createWebLogger("admin-user-service");

const BCRYPT_SALT_ROUNDS = 10;

/** Read-time ACL projection for admin HTTP handlers; writes are rechecked under row locks. */
export async function checkAdminUserMutationAccess(
  actorId: string,
  targetId: string,
  changesRole: boolean,
): Promise<"FORBIDDEN" | "USER_NOT_FOUND" | null> {
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: targetId }, select: { role: true } }),
  ]);
  if (!actor || (actor.role !== "ADMIN" && actor.role !== "MODERATOR")) return "FORBIDDEN";
  if (!target) return "USER_NOT_FOUND";
  if (
    actor.role === "MODERATOR" &&
    (changesRole || ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(target.role))
  )
    return "FORBIDDEN";
  return null;
}

/** Always read the current DB role, never trust the role embedded in an old JWT. */
export async function readAdminActorRole(actorId: string): Promise<UserRole | null> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true },
  });
  return actor?.role ?? null;
}

/** Central partner-permission policy; apps supply identity, core reads DB roles. */
export async function partnerChangeRequiresAdmin(
  actorId: string,
  userId: string,
  input: Pick<UpdateUserAdminInput, "role" | "partnerPromoCodeId">,
): Promise<boolean> {
  if (input.partnerPromoCodeId === undefined && input.role === undefined) return false;
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  const changesPartnerRole =
    input.role !== undefined &&
    input.role !== target?.role &&
    (input.role === "PARTNER" || target?.role === "PARTNER");
  return (input.partnerPromoCodeId !== undefined || changesPartnerRole) && actor?.role !== "ADMIN";
}

export async function getAllUsers(): Promise<AdminUserActionResult> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        registrationChannel: true,
        createdAt: true,
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
    return { success: true, data: users as AdminUserRow[] };
  } catch (error) {
    logger.error("Ошибка при получении пользователей", error as Error);
    return { success: false, error: "Не удалось получить список пользователей" };
  }
}

export async function updateUserAdmin(
  userId: string,
  input: UpdateUserAdminInput,
  actorId?: string,
): Promise<AdminUserUpdateResult> {
  try {
    if (input.role === "PARTNER" && !input.partnerPromoCodeId) {
      return {
        success: false,
        error: "Для назначения партнёра выберите свободный активный промокод",
      };
    }
    const updateData: {
      username?: string;
      email?: string | null;
      phone?: string;
      role?: UserRole;
      password?: string;
    } = {};

    if (input.username !== undefined) updateData.username = input.username;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.role !== undefined) updateData.role = input.role as UserRole;
    if (input.newPassword && input.newPassword.trim()) {
      updateData.password = await bcryptjs.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
    }
    await prisma.$transaction(async (tx) => {
      // Authorization must be checked while the actor and target roles are
      // protected by database row locks, not only in the HTTP adapter.
      if (actorId) {
        // Lock actor and target for ALL actor-backed edits, not only role edits.
        // A revoked moderator must not use a still-valid JWT to change passwords.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${userId}) ORDER BY "id" FOR UPDATE`;
        const [actor, target] = await Promise.all([
          tx.user.findUnique({ where: { id: actorId }, select: { role: true } }),
          tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
        ]);
        if (!actor || (actor.role !== "ADMIN" && actor.role !== "MODERATOR")) {
          throw new ServiceError("Недостаточно прав", "FORBIDDEN");
        }
        const partnerChange =
          input.partnerPromoCodeId !== undefined ||
          (input.role !== target?.role && (input.role === "PARTNER" || target?.role === "PARTNER"));
        if (partnerChange && actor.role !== "ADMIN") {
          throw new ServiceError(
            "Только администратор может управлять ролью и промокодом партнёра",
            "FORBIDDEN",
          );
        }
        if (
          actor.role === "MODERATOR" &&
          (input.role !== undefined ||
            input.partnerPromoCodeId !== undefined ||
            (target !== null && ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(target.role)))
        )
          throw new ServiceError("Недостаточно прав", "FORBIDDEN");
      } else if (input.role !== undefined || input.partnerPromoCodeId !== undefined) {
        throw new ServiceError("Необходима повторная авторизация", "FORBIDDEN");
      }
      // Role/password changes must invalidate access AND refresh credentials
      // atomically with the account edit, including on other devices.
      const securityChange = input.role !== undefined || updateData.password !== undefined;
      const revokedAt = securityChange ? new Date() : null;
      await tx.user.update({
        where: { id: userId },
        data: revokedAt ? { ...updateData, sessionsRevokedAt: revokedAt } : updateData,
      });
      if (revokedAt) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt },
        });
      }
      if (input.partnerPromoCodeId !== undefined) {
        await bindPartnerPromoCodeInTransaction(tx, {
          userId,
          promoCodeId: input.partnerPromoCodeId,
        });
      }
    });
    logger.info("Пользователь обновлён", { userId });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя", error as Error, { userId });
    if (error instanceof ServiceError) {
      return { success: false, error: error.message };
    }
    try {
      handlePrismaError(error, "Пользователь");
    } catch (serviceErr) {
      return { success: false, error: (serviceErr as Error).message };
    }
    return { success: false, error: "Не удалось обновить пользователя" };
  }
}

export async function deleteUserAdmin(
  userId: string,
  actorId: string,
): Promise<AdminUserDeleteResult> {
  if (actorId === userId) {
    return { success: false, error: "Нельзя удалить самого себя" };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // Must check real DB roles under locks before the cascade and cleanup outbox.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}, ${userId}) ORDER BY "id" FOR UPDATE`;
      const [actor, target] = await Promise.all([
        tx.user.findUnique({ where: { id: actorId }, select: { role: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { role: true } }),
      ]);
      if (
        !actor ||
        (actor.role !== "ADMIN" && actor.role !== "MODERATOR") ||
        (actor.role === "MODERATOR" &&
          (target === null || ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(target.role)))
      ) {
        throw new ServiceError("Недостаточно прав", "FORBIDDEN");
      }
      await enqueueAccountStorageCleanup(tx, userId, new Date());
      await tx.user.delete({ where: { id: userId } });
    });
    logger.info("Пользователь удалён", { userId, deletedBy: actorId });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении пользователя", error as Error, { userId });
    if (error instanceof ServiceError) {
      return { success: false, error: error.message };
    }
    try {
      handlePrismaError(error, "Пользователь");
    } catch (serviceErr) {
      return { success: false, error: (serviceErr as Error).message };
    }
    return { success: false, error: "Не удалось удалить пользователя" };
  }
}
