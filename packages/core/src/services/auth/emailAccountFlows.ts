/**
 * Сценарии аккаунта через email: сброс пароля, смена email.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { coreRegisterEmailSchema } from "../../validation/registerEmailDomain";
import {
  getPublicWebBaseUrl,
  sendEmailChangeConfirmEmail,
  sendEmailChangedNoticeEmail,
  sendPasswordResetLinkEmail,
} from "./transactionalAuthMail";

const logger = createWebLogger("email-account-flows");

const PASSWORD_RESET_THROTTLE_MS = 120_000;
const PASSWORD_RESET_TOKEN_HOURS = 1;
const EMAIL_CHANGE_TOKEN_HOURS = 24;

export const PASSWORD_RESET_REQUEST_MESSAGE =
  "Если аккаунт с таким email есть, проверьте почту. Повторный запрос возможен через 2 минуты и отменит предыдущую ссылку.";

/**
 * Запрос сброса пароля по email. При неизвестном email — без ошибки (антиперечисление).
 * Некорректный формат email — ошибка валидации для клиента.
 */
export async function sendPasswordResetRequestByEmail(rawEmail: string): Promise<void> {
  const parsed = coreRegisterEmailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    throw new Error("Некорректный email");
  }
  const email = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordResetRequestedAt: true },
  });

  if (!user?.email) {
    logger.info("Сброс пароля: пользователь с email не найден", {});
    return;
  }

  const now = Date.now();
  if (
    user.passwordResetRequestedAt &&
    now - user.passwordResetRequestedAt.getTime() < PASSWORD_RESET_THROTTLE_MS
  ) {
    return;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`;
  const expiresAt = new Date(now + PASSWORD_RESET_TOKEN_HOURS * 3600 * 1000);

  // Keep previously delivered links usable until the new message is accepted.
  // Claim the throttle atomically to stop concurrent requests from racing.
  const requestedAt = new Date(now);
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { passwordResetRequestedAt: null },
          { passwordResetRequestedAt: { lte: new Date(now - PASSWORD_RESET_THROTTLE_MS) } },
        ],
      },
      data: { passwordResetRequestedAt: requestedAt },
    });
    if (claim.count !== 1) return false;
    // Do not delete a previously delivered token before this one is accepted.
    await tx.passwordResetToken.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });
    return true;
  });
  if (!claimed) return;

  const resetUrl = `${getPublicWebBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetLinkEmail(user.email, resetUrl);
  } catch (error) {
    // A failed provider request must neither invalidate the older link nor
    // impose a 2-minute cooldown. Never remove a newer concurrent request.
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, token: tokenHash } });
      await tx.user.updateMany({
        where: { id: user.id, passwordResetRequestedAt: requestedAt },
        data: { passwordResetRequestedAt: user.passwordResetRequestedAt },
      });
    }).catch((rollbackError) => {
      logger.error("Password reset delivery cleanup unavailable", rollbackError as Error);
    });
    throw error;
  }
  // Only after accepted delivery invalidate the older links. Failure to clean
  // up is safer than invalidating the newly delivered link.
  await prisma.$transaction(async tx => {
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, token: { not: tokenHash } },
    });
  }).catch((error) => {
    logger.error("Password reset old-token cleanup unavailable", error as Error);
  });
}

/**
 * Запрос смены email: письмо на новый адрес со ссылкой подтверждения.
 */
export async function requestEmailChange(
  userId: string, newEmailRaw: string, currentPassword?: string,
): Promise<void> {
  const parsed = coreRegisterEmailSchema.safeParse(newEmailRaw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Некорректный email");
  }
  const newEmail = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true, passwordSetAt: true },
  });
  if (!user) throw new Error("Пользователь не найден");
  if (user.passwordSetAt != null &&
      (!currentPassword || !(await bcrypt.compare(currentPassword, user.password)))) {
    throw new Error("Неверный текущий пароль");
  }
  if (user.email?.toLowerCase() === newEmail) {
    throw new Error("Этот email уже указан в профиле");
  }

  const taken = await prisma.user.findUnique({
    where: { email: newEmail }, select: { id: true },
  });
  if (taken) throw new Error("Этот email уже занят");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_HOURS * 3600 * 1000);
  const confirmUrl = `${getPublicWebBaseUrl()}/profile/confirm-email?token=${encodeURIComponent(token)}`;

  // Stage before sending: a delivered link is never missing solely because
  // the database failed AFTER provider acceptance. Keep the prior link active
  // during delivery and remove ONLY the staged token on delivery failure.
  const stagedAt = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("Пользователь не найден");
    const current = await tx.user.findUnique({
      where: { id: userId }, select: { email: true, password: true, passwordSetAt: true },
    });
    if (current?.email?.toLowerCase() === newEmail) {
      throw new Error("Этот email уже указан в профиле");
    }
    if (!current || current.password !== user.password ||
        current.passwordSetAt?.getTime() !== user.passwordSetAt?.getTime()) {
      throw new Error("Неверный текущий пароль");
    }
    const conflict = await tx.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (conflict && conflict.id !== userId) throw new Error("Этот email уже занят");
    // A rapid sequential request can have the same millisecond timestamp as
    // the prior row. Random-token lexical ordering cannot define issuance
    // order: it can leave a previously delivered link active. The owner row
    // lock serializes this read and makes each staged timestamp monotonic.
    const latest = await tx.emailChangeToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const createdAt = new Date(Math.max(
      Date.now(),
      (latest?.createdAt.getTime() ?? 0) + 1,
    ));
    const staged = await tx.emailChangeToken.create({
      data: { userId, newEmail, token, expiresAt, createdAt },
    });
    return staged.createdAt;
  });

  try {
    await sendEmailChangeConfirmEmail(newEmail, confirmUrl);
  } catch (error) {
    await prisma.$transaction(async tx => {
      await tx.emailChangeToken.deleteMany({ where: { userId, token } });
    }).catch((cleanupError) => {
      logger.error("Email change delivery cleanup unavailable", cleanupError as Error);
    });
    throw error;
  }
  // One active delivered request per owner. Never delete the new token.
  await prisma.$transaction(async tx => {
    await tx.emailChangeToken.deleteMany({
      where: { userId, OR: [
        { createdAt: { lt: stagedAt } },
        { createdAt: stagedAt, token: { lt: token } },
      ] },
    });
  }).catch((error) => {
    logger.error("Email change old-token cleanup unavailable", error as Error);
  });
}
/**
 * Подтверждение смены email по токену из письма.
 */
export async function confirmEmailChangeByToken(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("Ссылка недействительна");
  }

  try {
    const previousEmail = await prisma.$transaction(async (tx) => {
      const seen = await tx.emailChangeToken.findUnique({ where: { token } });
      if (!seen) throw new Error("Ссылка недействительна или устарела");

      // The token read alone is not an ownership lock. Competing confirmations
      // can both read the same row and both ACK unless we serialize on User.
      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User" WHERE "id" = ${seen.userId} FOR UPDATE
      `;
      // READ COMMITTED: after acquiring the lock, re-read token existence and
      // expiry. First confirm may already have consumed/deleted the row.
      const row = await tx.emailChangeToken.findUnique({ where: { token } });
      if (!row || row.expiresAt <= new Date()) {
        throw new Error("Ссылка недействительна или устарела");
      }

      const conflict = await tx.user.findUnique({
        where: { email: row.newEmail },
        select: { id: true },
      });
      if (conflict && conflict.id !== row.userId) {
        throw new Error("Этот email уже занят");
      }

      const previous = await tx.user.findUnique({
        where: { id: row.userId }, select: { email: true },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { email: row.newEmail },
        select: { email: true },
      });
      await tx.emailChangeToken.deleteMany({ where: { userId: row.userId } });
      return previous?.email;
    });
    if (previousEmail?.trim()) {
      await sendEmailChangedNoticeEmail(previousEmail).catch((error) => {
        logger.error("Email change old-address notice unavailable", error as Error);
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("уже занят")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("недействительна")) {
      throw error;
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (code === "P2002") {
      throw new Error("Этот email уже занят");
    }
    throw error instanceof Error ? error : new Error("Не удалось подтвердить email");
  }
}
