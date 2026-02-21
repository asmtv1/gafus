import bcryptjs from "bcryptjs";

import { prisma } from "@gafus/prisma";
import type { UserRole } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

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

export async function getAllUsers(): Promise<AdminUserActionResult> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        phone: true,
        role: true,
        isConfirmed: true,
        createdAt: true,
        profile: { select: { fullName: true, avatarUrl: true } },
        _count: { select: { pushSubscriptions: true } },
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
): Promise<AdminUserUpdateResult> {
  try {
    const updateData: {
      username?: string;
      phone?: string;
      role?: UserRole;
      password?: string;
      isConfirmed?: boolean;
    } = {};

    if (input.username !== undefined) updateData.username = input.username;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.role !== undefined) updateData.role = input.role as UserRole;
    if (input.newPassword && input.newPassword.trim()) {
      updateData.password = await bcryptjs.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
    }
    if (input.isConfirmed !== undefined) updateData.isConfirmed = input.isConfirmed;

    await prisma.user.update({ where: { id: userId }, data: updateData });
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
    await prisma.user.delete({ where: { id: userId } });
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
