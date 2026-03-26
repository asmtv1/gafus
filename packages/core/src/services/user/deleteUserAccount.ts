/**
 * Необратимое удаление аккаунта (самообслуживание USER / PREMIUM).
 * Удаляется запись User (username, email, phone, telegramId и т.д.).
 * Перед удалением обезличиваются ConsentLog, привязанные к userId (formData/ip/userAgent),
 * чтобы email из регистрации не оставался в JSON после отвязки userId (onDelete: SetNull).
 */

import { z } from "zod";

import { prisma, Prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { validateCredentials } from "../auth/authService";

const logger = createWebLogger("core-delete-user-account");

export const deleteUserAccountBodySchema = z.object({
  password: z.string().trim().min(1, "Введите пароль").max(128),
});

export type DeleteUserAccountBody = z.infer<typeof deleteUserAccountBodySchema>;

export type DeleteUserAccountInput = { actorUserId: string } & DeleteUserAccountBody;

export type DeleteUserAccountErrorCode =
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "INTERNAL";

export type DeleteUserAccountResult =
  | { success: true }
  | {
      success: false;
      error: string;
      code?: DeleteUserAccountErrorCode;
    };

const ROLE_SELF_DELETE = new Set(["USER", "PREMIUM"]);

/**
 * Удаляет пользователя после проверки роли, пароля и отсутствия авторского контента.
 */
export async function deleteUserAccount(
  input: DeleteUserAccountInput,
): Promise<DeleteUserAccountResult> {
  const { actorUserId, password } = input;

  if (!actorUserId?.trim()) {
    return {
      success: false,
      error: "Пользователь не найден",
      code: "VALIDATION",
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        username: true,
        role: true,
        passwordSetAt: true,
        email: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: "Пользователь не найден",
        code: "VALIDATION",
      };
    }

    if (!ROLE_SELF_DELETE.has(user.role)) {
      return {
        success: false,
        error:
          "Удаление аккаунта доступно только для пользователей. Обратитесь в поддержку.",
        code: "FORBIDDEN",
      };
    }

    if (user.passwordSetAt == null) {
      return {
        success: false,
        error: "Сначала установите пароль в настройках профиля.",
        code: "FORBIDDEN",
      };
    }

    const [courses, days, steps, templates, articles] = await Promise.all([
      prisma.course.count({ where: { authorId: actorUserId } }),
      prisma.trainingDay.count({ where: { authorId: actorUserId } }),
      prisma.step.count({ where: { authorId: actorUserId } }),
      prisma.stepTemplate.count({ where: { authorId: actorUserId } }),
      prisma.article.count({ where: { authorId: actorUserId } }),
    ]);

    if (courses + days + steps + templates + articles > 0) {
      return {
        success: false,
        error:
          "Невозможно удалить аккаунт: у вас есть созданный контент. Обратитесь в поддержку.",
        code: "CONFLICT",
      };
    }

    const cred = await validateCredentials(user.username, password);
    if (!cred.success) {
      return { success: false, error: "Неверный пароль" };
    }

    const hadEmail = user.email != null && user.email.length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId: actorUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.consentLog.updateMany({
        where: { userId: actorUserId },
        data: {
          formData: Prisma.DbNull,
          ipAddress: null,
          userAgent: null,
        },
      });
      await tx.user.delete({ where: { id: actorUserId } });
    });

    logger.success("Аккаунт удалён", { userId: actorUserId, hadEmail });
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        logger.error(
          "FK при удалении пользователя",
          error instanceof Error ? error : new Error(String(error)),
          { userId: actorUserId },
        );
        return {
          success: false,
          error: "Не удалось удалить аккаунт. Обратитесь в поддержку.",
          code: "INTERNAL",
        };
      }
      if (error.code === "P2025") {
        logger.warn("Пользователь не найден при удалении", { userId: actorUserId });
        return {
          success: false,
          error: "Не удалось удалить аккаунт. Обратитесь в поддержку.",
          code: "INTERNAL",
        };
      }
    }

    logger.error(
      "Ошибка удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      { userId: actorUserId },
    );
    return {
      success: false,
      error: "Не удалось удалить аккаунт. Обратитесь в поддержку.",
      code: "INTERNAL",
    };
  }
}
