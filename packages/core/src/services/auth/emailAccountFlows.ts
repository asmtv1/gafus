/**
 * Сценарии аккаунта через email: сброс пароля, смена email.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";

import { createWebLogger } from "@gafus/logger";

import { coreRegisterEmailSchema } from "../../validation/registerEmailDomain";
import {
  getPublicWebBaseUrl,
  sendEmailChangeConfirmEmail,
  sendEmailChangedNoticeEmail,
  sendPasswordResetLinkEmail,
} from "./transactionalAuthMail";

const logger = createWebLogger("email-account-flows");

/** SQL remains in identity-write-server: single-use token transactions,
 * owner row locks, CAS throttle/rollback and provider ACK ordering.
 * Core owns anti-enumeration, token hash, public errors and email delivery.
 */
export interface EmailAccountRowsPort {
  readPasswordResetRequestUser(email: string): Promise<{
    id: string; email: string | null; passwordResetRequestedAt: Date | null;
  } | null>;
  claimPasswordResetEmailToken(input: {
    userId: string; tokenHash: string; expiresAt: Date; requestedAt: Date; throttleMs: number;
  }): Promise<boolean>;
  rollbackFailedPasswordResetEmailToken(input: {
    userId: string; tokenHash: string; requestedAt: Date; previousRequestedAt: Date | null;
  }): Promise<unknown>;
  retireOlderPasswordResetEmailTokens(userId: string, deliveredTokenHash: string): Promise<unknown>;
  readEmailChangeAccount(userId: string): Promise<{
    email: string | null; password: string; passwordSetAt: Date | null;
  } | null>;
  readEmailOwner(email: string): Promise<{ id: string } | null>;
  stageEmailChange(input: {
    userId: string; newEmail: string; token: string; expiresAt: Date;
    expectedPassword: string; expectedPasswordSetAt: Date | null;
  }): Promise<Date>;
  rollbackUndeliveredEmailChange(userId: string, token: string): Promise<unknown>;
  retireOlderEmailChangeTokens(userId: string, token: string, stagedAt: Date): Promise<unknown>;
  consumeEmailChangeConfirmation(token: string): Promise<string | null | undefined>;
}
let installedEmailAccountRowsPort: Readonly<EmailAccountRowsPort> | null = null;
export function registerEmailAccountRowsPort(port: EmailAccountRowsPort): void {
  if (installedEmailAccountRowsPort !== null && installedEmailAccountRowsPort !== port) {
    throw new Error("EMAIL_ACCOUNT_ROWS_PORT_ALREADY_BOUND");
  }
  installedEmailAccountRowsPort = port;
}
function requireEmailAccountRowsPort(): Readonly<EmailAccountRowsPort> {
  if (!installedEmailAccountRowsPort) throw new Error("EMAIL_ACCOUNT_ROWS_PORT_UNBOUND");
  return installedEmailAccountRowsPort;
}



const PASSWORD_RESET_THROTTLE_MS = 120_000;
const PASSWORD_RESET_TOKEN_HOURS = 1;
const EMAIL_CHANGE_TOKEN_HOURS = 24;

export const PASSWORD_RESET_REQUEST_MESSAGE =
  "Если аккаунт с таким email есть, проверьте почту. Повторный запрос возможен через 2 минуты и отменит предыдущую ссылку.";

/**
 * Запрос сброса пароля по email. При неизвестном email — без ошибки (антиперечисление).
 * Некорректный формат email — ошибка валидации для клиента.
 */
export async function sendPasswordResetRequestByEmail(rawEmail: string, rows?: EmailAccountRowsPort): Promise<void> {
  const parsed = coreRegisterEmailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    throw new Error("Некорректный email");
  }
  const email = parsed.data;

  const user = await (rows ?? requireEmailAccountRowsPort()).readPasswordResetRequestUser(email);

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
  const claimed = await (rows ?? requireEmailAccountRowsPort()).claimPasswordResetEmailToken({
    userId: user.id, tokenHash, expiresAt, requestedAt,
    throttleMs: PASSWORD_RESET_THROTTLE_MS,
  });
  if (!claimed) return;

  const resetUrl = `${getPublicWebBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    const disposition = await sendPasswordResetLinkEmail(user.email, resetUrl);
    // Durable enqueue is not provider acceptance. Do not revoke an older
    // usable link just because a replacement is still waiting for delivery.
    if (disposition === "queued") return;
  } catch (error) {
    // A failed provider request must neither invalidate the older link nor
    // impose a 2-minute cooldown. Never remove a newer concurrent request.
    await (rows ?? requireEmailAccountRowsPort()).rollbackFailedPasswordResetEmailToken({
      userId: user.id, tokenHash, requestedAt,
      previousRequestedAt: user.passwordResetRequestedAt,
    }).catch((rollbackError) => {
      logger.error("Password reset delivery cleanup unavailable", rollbackError as Error);
    });
    throw error;
  }
  // Only after accepted delivery invalidate the older links. Failure to clean
  // up is safer than invalidating the newly delivered link.
  await (rows ?? requireEmailAccountRowsPort()).retireOlderPasswordResetEmailTokens(user.id, tokenHash).catch((error) => {
    logger.error("Password reset old-token cleanup unavailable", error as Error);
  });
}

/**
 * Запрос смены email: письмо на новый адрес со ссылкой подтверждения.
 */
export async function requestEmailChange(
  userId: string, newEmailRaw: string, currentPassword?: string,
  rows?: EmailAccountRowsPort,
): Promise<void> {
  const parsed = coreRegisterEmailSchema.safeParse(newEmailRaw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Некорректный email");
  }
  const newEmail = parsed.data;

  const user = await (rows ?? requireEmailAccountRowsPort()).readEmailChangeAccount(userId);
  if (!user) throw new Error("Пользователь не найден");
  if (user.passwordSetAt != null &&
      (!currentPassword || !(await bcrypt.compare(currentPassword, user.password)))) {
    throw new Error("Неверный текущий пароль");
  }
  if (user.email?.toLowerCase() === newEmail) {
    throw new Error("Этот email уже указан в профиле");
  }

  const taken = await (rows ?? requireEmailAccountRowsPort()).readEmailOwner(newEmail);
  if (taken) throw new Error("Этот email уже занят");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_HOURS * 3600 * 1000);
  const confirmUrl = `${getPublicWebBaseUrl()}/profile/confirm-email?token=${encodeURIComponent(token)}`;

  // Stage before sending: a delivered link is never missing solely because
  // the database failed AFTER provider acceptance. Keep the prior link active
  // during delivery and remove ONLY the staged token on delivery failure.
  const stagedAt = await (rows ?? requireEmailAccountRowsPort()).stageEmailChange({
    userId, newEmail, token, expiresAt,
    expectedPassword: user.password,
    expectedPasswordSetAt: user.passwordSetAt,
  });

  try {
    await sendEmailChangeConfirmEmail(newEmail, confirmUrl);
  } catch (error) {
    await (rows ?? requireEmailAccountRowsPort()).rollbackUndeliveredEmailChange(userId, token).catch((cleanupError) => {
      logger.error("Email change delivery cleanup unavailable", cleanupError as Error);
    });
    throw error;
  }
  // One active delivered request per owner. Never delete the new token.
  await (rows ?? requireEmailAccountRowsPort()).retireOlderEmailChangeTokens(userId, token, stagedAt).catch((error) => {
    logger.error("Email change old-token cleanup unavailable", error as Error);
  });
}
/**
 * Подтверждение смены email по токену из письма.
 */
export async function confirmEmailChangeByToken(rawToken: string, rows?: EmailAccountRowsPort): Promise<void> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("Ссылка недействительна");
  }

  try {
    const previousEmail = await (rows ?? requireEmailAccountRowsPort()).consumeEmailChangeConfirmation(token);
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
