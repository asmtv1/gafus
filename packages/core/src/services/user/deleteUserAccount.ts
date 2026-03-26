/**
 * Необратимое удаление аккаунта (самообслуживание USER / PREMIUM).
 * Подтверждение — одноразовый 6-значный код из письма на email профиля.
 */

import crypto from "crypto";

import { prisma, Prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { sendAccountDeletionCodeEmail } from "../auth/transactionalAuthMail";

const logger = createWebLogger("core-delete-user-account");

const DELETION_CODE_TTL_MS = 15 * 60 * 1000;
const DELETION_REQUEST_THROTTLE_MS = 120_000;
const SHORT_CODE_ATTEMPTS = 8;

export const deleteUserAccountBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Введите 6-значный код из письма"),
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

export type RequestAccountDeletionCodeResult =
  | { success: true }
  | {
      success: false;
      error: string;
      code?: DeleteUserAccountErrorCode;
    };

const ROLE_SELF_DELETE = new Set(["USER", "PREMIUM"]);

function randomSixDigitCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

async function assertSelfDeletionUser(actorUserId: string): Promise<
  | {
      ok: true;
      user: { id: string; username: string; role: string; email: string | null };
    }
  | { ok: false; result: DeleteUserAccountResult }
> {
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      username: true,
      role: true,
      email: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Пользователь не найден",
        code: "VALIDATION",
      },
    };
  }

  if (!ROLE_SELF_DELETE.has(user.role)) {
    return {
      ok: false,
      result: {
        success: false,
        error:
          "Удаление аккаунта доступно только для пользователей. Обратитесь в поддержку.",
        code: "FORBIDDEN",
      },
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
      ok: false,
      result: {
        success: false,
        error:
          "Невозможно удалить аккаунт: у вас есть созданный контент. Обратитесь в поддержку.",
        code: "CONFLICT",
      },
    };
  }

  return { ok: true, user };
}

/**
 * Отправляет на email профиля код для подтверждения удаления (throttle 2 мин).
 */
export async function requestAccountDeletionCode(
  actorUserId: string,
): Promise<RequestAccountDeletionCodeResult> {
  if (!actorUserId?.trim()) {
    return {
      success: false,
      error: "Пользователь не найден",
      code: "VALIDATION",
    };
  }

  try {
    const gate = await assertSelfDeletionUser(actorUserId);
    if (!gate.ok) {
      return gate.result;
    }

    const email = gate.user.email?.trim();
    if (!email) {
      return {
        success: false,
        error:
          "Укажите email в профиле — на него будет отправлен код подтверждения удаления.",
        code: "FORBIDDEN",
      };
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { accountDeletionRequestedAt: true },
    });

    const now = Date.now();
    if (
      fullUser?.accountDeletionRequestedAt &&
      now - fullUser.accountDeletionRequestedAt.getTime() < DELETION_REQUEST_THROTTLE_MS
    ) {
      return {
        success: false,
        error: "Код уже отправлен. Подождите пару минут перед повторной отправкой.",
        code: "FORBIDDEN",
      };
    }

    const expiresAt = new Date(now + DELETION_CODE_TTL_MS);
    let shortCode = "";

    await prisma.$transaction(async (tx) => {
      await tx.accountDeletionToken.deleteMany({ where: { userId: actorUserId } });

      for (let i = 0; i < SHORT_CODE_ATTEMPTS; i += 1) {
        const candidate = randomSixDigitCode();
        const exists = await tx.accountDeletionToken.findUnique({
          where: { shortCode: candidate },
          select: { id: true },
        });
        if (exists) {
          continue;
        }
        await tx.accountDeletionToken.create({
          data: {
            userId: actorUserId,
            shortCode: candidate,
            expiresAt,
          },
        });
        shortCode = candidate;
        break;
      }

      if (!shortCode) {
        throw new Error("Не удалось сгенерировать код");
      }

      await tx.user.update({
        where: { id: actorUserId },
        data: { accountDeletionRequestedAt: new Date() },
      });
    });

    await sendAccountDeletionCodeEmail(email, shortCode);
    logger.info("Код удаления аккаунта отправлен", { userId: actorUserId });
    return { success: true };
  } catch (error) {
    logger.error(
      "Ошибка запроса кода удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      { userId: actorUserId },
    );
    return {
      success: false,
      error: "Не удалось отправить код. Попробуйте позже.",
      code: "INTERNAL",
    };
  }
}

/**
 * Удаляет пользователя после проверки роли, кода из письма и отсутствия авторского контента.
 */
export async function deleteUserAccount(
  input: DeleteUserAccountInput,
): Promise<DeleteUserAccountResult> {
  const { actorUserId, code } = input;

  if (!actorUserId?.trim()) {
    return {
      success: false,
      error: "Пользователь не найден",
      code: "VALIDATION",
    };
  }

  try {
    const gate = await assertSelfDeletionUser(actorUserId);
    if (!gate.ok) {
      return gate.result;
    }

    const token = await prisma.accountDeletionToken.findFirst({
      where: { userId: actorUserId, shortCode: code },
    });

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      return {
        success: false,
        error: "Неверный или просроченный код. Запросите новый код на email.",
      };
    }

    const hadEmail = gate.user.email != null && gate.user.email.length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.accountDeletionToken.deleteMany({ where: { userId: actorUserId } });
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
