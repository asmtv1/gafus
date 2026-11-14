/**
 * Необратимое удаление аккаунта (самообслуживание USER).
 * Подтверждение — одноразовый 6-значный код из письма на email профиля.
 */

import crypto from "crypto";


import { createWebLogger } from "@gafus/logger";
import { z } from "zod/v3";


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

export type DeleteUserAccountErrorCode = "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "INTERNAL";

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

/** Storage operations are bound at the API composition root. SQL and locks
 * remain in the identity-write adapter and the cleanup callback runs INSIDE
 * its original transaction. No Prisma dependency is exposed to Core.
 */
export interface AccountDeletionPorts {
  readAccountDeletionPreflightRow: (actorId: string) => Promise<{
    id: string; username: string; email: string | null;
  } | null>;
  readAccountDeletionActorRow: (actorId: string) => Promise<{
    id: string; username: string; role: string; email: string | null;
  } | null>;
  readAccountDeletionAuthoredCounts: (actorId: string) => Promise<[
    number, number, number, number, number,
  ]>;
  readAccountDeletionRequestedAt: (actorId: string) => Promise<{
    accountDeletionRequestedAt: Date | null;
  } | null>;
  readAccountDeletionChallenge: (
    actorId: string, shortCode: string,
  ) => Promise<{ expiresAt: Date } | null>;
  replaceAccountDeletionChallenge: (
    actorId: string, expiresAt: Date, attempts: number,
    generateCode: () => string,
  ) => Promise<string>;
  deleteAccountAndPersistCleanup: (
    actorId: string, role: string, hadEmail: boolean, at: Date,
  ) => Promise<void>;
  deletionPrismaRequestErrorCode: (error: unknown) => string | null;
}

export function createAccountDeletionService(ports: AccountDeletionPorts) {
  const {
    readAccountDeletionPreflightRow,
    readAccountDeletionActorRow,
    readAccountDeletionAuthoredCounts,
    readAccountDeletionRequestedAt,
    readAccountDeletionChallenge,
    replaceAccountDeletionChallenge,
    deleteAccountAndPersistCleanup,
    deletionPrismaRequestErrorCode,
  } = ports;

/** Minimal self-delete preflight deliberately avoids avatar/CDN signing.
 *  Never expose the email address or challenge token to the browser.
 */
async function readAccountDeletionPreflight(actorUserId: string) {
  if (!actorUserId?.trim()) return null;
  const user = await readAccountDeletionPreflightRow(actorUserId);
  if (!user) return null;
  return { id: user.id, username: user.username, hasEmail: !!user.email?.trim() };
}

const ROLE_SELF_DELETE = new Set(["USER"]);

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
  const user = await readAccountDeletionActorRow(actorUserId);

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
        error: "Удаление аккаунта доступно только для пользователей. Обратитесь в поддержку.",
        code: "FORBIDDEN",
      },
    };
  }

  const [courses, days, steps, templates, articles] =
    await readAccountDeletionAuthoredCounts(actorUserId);

  if (courses + days + steps + templates + articles > 0) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Невозможно удалить аккаунт: у вас есть созданный контент. Обратитесь в поддержку.",
        code: "CONFLICT",
      },
    };
  }

  return { ok: true, user };
}

/**
 * Отправляет на email профиля код для подтверждения удаления (throttle 2 мин).
 */
async function requestAccountDeletionCode(
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
        error: "Укажите email в профиле — на него будет отправлен код подтверждения удаления.",
        code: "FORBIDDEN",
      };
    }

    const fullUser = await readAccountDeletionRequestedAt(actorUserId);

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
    const shortCode = await replaceAccountDeletionChallenge(
      actorUserId,
      expiresAt,
      SHORT_CODE_ATTEMPTS,
      randomSixDigitCode,
    );

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
async function deleteUserAccount(
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

    const token = await readAccountDeletionChallenge(actorUserId, code);

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      return {
        success: false,
        error: "Неверный или просроченный код. Запросите новый код на email.",
      };
    }

    const hadEmail = gate.user.email != null && gate.user.email.length > 0;
    const deletionRole = gate.user.role;
    const deletionTimestamp = new Date();
    await deleteAccountAndPersistCleanup(
      actorUserId,
      deletionRole,
      hadEmail,
      deletionTimestamp,
    );

    logger.success("Аккаунт удалён", { userId: actorUserId, hadEmail });
    return { success: true };
  } catch (error) {
    const deletionErrorCode = deletionPrismaRequestErrorCode(error);
    if (deletionErrorCode !== null) {
      if (deletionErrorCode === "P2003") {
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
      if (deletionErrorCode === "P2025") {
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

  return {
    readAccountDeletionPreflight,
    requestAccountDeletionCode,
    deleteUserAccount,
  };
}
