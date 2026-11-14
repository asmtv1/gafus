import bcryptjs from "bcryptjs";

import { createWebLogger } from "@gafus/logger";

import { handlePrismaError } from "../../errors/prismaErrorHandler";
import { ServiceError } from "../../errors/ServiceError";
import type {
  AdminUserRow,
  AdminUserActionResult,
  AdminUserDeleteResult,
  AdminUserUpdateResult,
  UpdateUserAdminInput,
  AdminUserRole,
} from "./types";

const logger = createWebLogger("admin-user-service");

const BCRYPT_SALT_ROUNDS = 10;

/** Port-typed application policy. Database locks, transaction, partner CAS and
 * account cleanup outbox remain in the server adapters passed by composition.
 */
export interface AdminUserPorts {
  readAdminUserRoles: (
    actorId: string, targetId: string,
  ) => Promise<{ actorRole: AdminUserRole | null; targetRole: AdminUserRole | null }>;
  readAdminUserRole: (actorId: string) => Promise<AdminUserRole | null>;
  readAdminUserListRows: () => Promise<AdminUserRow[]>;
  updateAdminUserRows: (
    userId: string,
    input: {
      username?: string;
      email?: string | null;
      phone?: string;
      role?: AdminUserRole;
      passwordHash?: string;
      partnerPromoCodeId?: string;
    },
    actorId: string | undefined,
    authorize: (actorRole: AdminUserRole | null, targetRole: AdminUserRole | null) => void,
  ) => Promise<void>;
  deleteAdminUserRows: (
    userId: string, actorId: string,
    authorize: (actorRole: AdminUserRole | null, targetRole: AdminUserRole | null) => void,
  ) => Promise<void>;
}

export function createAdminUserService(ports: AdminUserPorts) {
  const {
    readAdminUserRoles, readAdminUserRole, readAdminUserListRows,
    updateAdminUserRows, deleteAdminUserRows,
  } = ports;

/** Read-time ACL projection for admin HTTP handlers; writes are rechecked under row locks. */
async function checkAdminUserMutationAccess(
  actorId: string,
  targetId: string,
  changesRole: boolean,
): Promise<"FORBIDDEN" | "USER_NOT_FOUND" | null> {
  const { actorRole, targetRole } = await readAdminUserRoles(actorId, targetId);
  if (!actorRole || (actorRole !== "ADMIN" && actorRole !== "MODERATOR")) return "FORBIDDEN";
  if (!targetRole) return "USER_NOT_FOUND";
  if (
    actorRole === "MODERATOR" &&
    (changesRole || ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(targetRole))
  )
    return "FORBIDDEN";
  return null;
}

/** Always read the current DB role, never trust the role embedded in an old JWT. */
async function readAdminActorRole(actorId: string): Promise<AdminUserRole | null> {
  return readAdminUserRole(actorId);
}

/** Central partner-permission policy; apps supply identity, core reads DB roles. */
async function partnerChangeRequiresAdmin(
  actorId: string,
  userId: string,
  input: Pick<UpdateUserAdminInput, "role" | "partnerPromoCodeId">,
): Promise<boolean> {
  if (input.partnerPromoCodeId === undefined && input.role === undefined) return false;
  const { actorRole, targetRole } = await readAdminUserRoles(actorId, userId);
  const changesPartnerRole =
    input.role !== undefined &&
    input.role !== targetRole &&
    (input.role === "PARTNER" || targetRole === "PARTNER");
  return (input.partnerPromoCodeId !== undefined || changesPartnerRole) && actorRole !== "ADMIN";
}

async function getAllUsers(): Promise<AdminUserActionResult> {
  try {
    const users = await readAdminUserListRows();
    return { success: true, data: users as AdminUserRow[] };
  } catch (error) {
    logger.error("Ошибка при получении пользователей", error as Error);
    return { success: false, error: "Не удалось получить список пользователей" };
  }
}

async function updateUserAdmin(
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
    const passwordHash = input.newPassword?.trim()
      ? await bcryptjs.hash(input.newPassword, BCRYPT_SALT_ROUNDS)
      : undefined;
    await updateAdminUserRows(userId, {
      username: input.username, email: input.email, phone: input.phone,
      role: input.role as AdminUserRole | undefined,
      passwordHash, partnerPromoCodeId: input.partnerPromoCodeId,
    }, actorId, (actorRole, targetRole) => {
        // Roles were read after locking both rows in stable order, not from JWT.
        if (actorId) {
          if (actorRole !== "ADMIN" && actorRole !== "MODERATOR")
            throw new ServiceError("Недостаточно прав", "FORBIDDEN");
          const partnerChange = input.partnerPromoCodeId !== undefined ||
            (input.role !== targetRole &&
              (input.role === "PARTNER" || targetRole === "PARTNER"));
          if (partnerChange && actorRole !== "ADMIN")
            throw new ServiceError(
              "Только администратор может управлять ролью и промокодом партнёра", "FORBIDDEN",
            );
          if (actorRole === "MODERATOR" &&
            (input.role !== undefined || input.partnerPromoCodeId !== undefined ||
              (targetRole !== null &&
                ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(targetRole))))
            throw new ServiceError("Недостаточно прав", "FORBIDDEN");
        } else if (input.role !== undefined || input.partnerPromoCodeId !== undefined) {
          throw new ServiceError("Необходима повторная авторизация", "FORBIDDEN");
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

async function deleteUserAdmin(
  userId: string,
  actorId: string,
): Promise<AdminUserDeleteResult> {
  if (actorId === userId) {
    return { success: false, error: "Нельзя удалить самого себя" };
  }
  try {
    await deleteAdminUserRows(userId, actorId, (actorRole, targetRole) => {
      if (!actorRole ||
        (actorRole !== "ADMIN" && actorRole !== "MODERATOR") ||
        (actorRole === "MODERATOR" &&
          (targetRole === null ||
            ["ADMIN", "MODERATOR", "TRAINER", "PARTNER"].includes(targetRole))))
        throw new ServiceError("Недостаточно прав", "FORBIDDEN");
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

  return {
    checkAdminUserMutationAccess,
    readAdminActorRole,
    partnerChangeRequiresAdmin,
    getAllUsers,
    updateUserAdmin,
    deleteUserAdmin,
  };
}
