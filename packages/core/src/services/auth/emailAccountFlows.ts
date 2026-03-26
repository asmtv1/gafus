/**
 * Сценарии аккаунта через email: сброс пароля, смена email.
 */

import crypto from "crypto";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { coreRegisterEmailSchema } from "../../validation/registerEmailDomain";
import {
  getPublicWebBaseUrl,
  sendEmailChangeConfirmEmail,
  sendPasswordResetLinkEmail,
} from "./transactionalAuthMail";

const logger = createWebLogger("email-account-flows");

const PASSWORD_RESET_THROTTLE_MS = 120_000;
const PASSWORD_RESET_TOKEN_HOURS = 1;
const EMAIL_CHANGE_TOKEN_HOURS = 24;

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
  const expiresAt = new Date(now + PASSWORD_RESET_TOKEN_HOURS * 3600 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { passwordResetRequestedAt: new Date() },
    });
  });

  const resetUrl = `${getPublicWebBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetLinkEmail(user.email, resetUrl);
}

/**
 * Запрос смены email: письмо на новый адрес со ссылкой подтверждения.
 */
export async function requestEmailChange(userId: string, newEmailRaw: string): Promise<void> {
  const parsed = coreRegisterEmailSchema.safeParse(newEmailRaw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Некорректный email");
  }
  const newEmail = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    throw new Error("Пользователь не найден");
  }
  if (user.email?.toLowerCase() === newEmail) {
    throw new Error("Этот email уже указан в профиле");
  }

  const taken = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (taken) {
    throw new Error("Этот email уже занят");
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_HOURS * 3600 * 1000);

  await prisma.emailChangeToken.deleteMany({ where: { userId } });
  await prisma.emailChangeToken.create({
    data: { userId, newEmail, token, expiresAt },
  });

  const confirmUrl = `${getPublicWebBaseUrl()}/profile/confirm-email?token=${encodeURIComponent(token)}`;
  await sendEmailChangeConfirmEmail(newEmail, confirmUrl);
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
    await prisma.$transaction(async (tx) => {
      const row = await tx.emailChangeToken.findUnique({
        where: { token },
      });
      if (!row || row.expiresAt < new Date()) {
        throw new Error("Ссылка недействительна или устарела");
      }

      const conflict = await tx.user.findUnique({
        where: { email: row.newEmail },
        select: { id: true },
      });
      if (conflict && conflict.id !== row.userId) {
        throw new Error("Этот email уже занят");
      }

      await tx.user.update({
        where: { id: row.userId },
        data: { email: row.newEmail },
      });
      await tx.emailChangeToken.deleteMany({ where: { userId: row.userId } });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("уже занят")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("недействительна")) {
      throw error;
    }
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    if (code === "P2002") {
      throw new Error("Этот email уже занят");
    }
    throw error instanceof Error ? error : new Error("Не удалось подтвердить email");
  }
}
