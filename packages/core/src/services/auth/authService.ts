/**
 * Auth Service - бизнес-логика аутентификации
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Server Actions являются тонкими обёртками над этими функциями.
 */

import bcrypt from "bcryptjs";
import parsePhoneNumberFromString from "libphonenumber-js";
import { z } from "zod/v3";

import { resetPasswordByToken } from "./passwordReset";
import {
  readAuthUsernameChangeActor,
  readAuthUsernameCandidate,
  updateAuthUsername,
  readAuthCurrentUsername,
  readAuthUsernameOwner,
  readAuthUserSummary,
  readLoginCredentials,
  readAuthRegistrationPending,
  createAuthRefreshToken,
  readAuthRefreshToken,
  rotateAuthRefreshToken,
  revokeAuthRefreshToken,
  revokeAllAuthSessions,
  readAuthVkPhone,
  readAuthPhoneOwnerExcluding,
  updateAuthVkPhone,
  readAuthPasswordSetAt,
  setAuthPasswordOnce,
  readAuthNotificationEmail,
  readAuthPasswordForChange,
  changeAuthPasswordCAS,
  type RegistrationChannel,
} from "./authRowsPort";
import { createWebLogger } from "@gafus/logger";

import {
  registerUserWithCredentials,
  type RegisterCredentialsConflictCode,
} from "./registerUserWithCredentials";
import type { CreateConsentLogsParams } from "@gafus/types";
import {
  sendPasswordChangedNoticeEmail,
  sendUsernameChangedNoticeEmail,
  sendWelcomeEmailAfterRegistration,
} from "./transactionalAuthMail";

const logger = createWebLogger("auth-service");

/** Единый текст при конфликте username/email (защита от перечисления email). */
export const REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE =
  "Пользователь с такими данными уже существует";

const newPasswordSchema = z
  .string()
  .min(8, "минимум 8 символов")
  .max(100, "максимум 100 символов")
  .regex(/[A-Z]/, "минимум одна заглавная буква")
  .regex(/[a-z]/, "минимум одна строчная буква")
  .regex(/[0-9]/, "минимум одна цифра");

/** Результат успешной верификации учётных данных */
export interface ValidateCredentialsSuccess {
  success: true;
  user: { id: string; username: string; role: string; password: string };
}

/** Результат неуспешной верификации */
export interface ValidateCredentialsFailure {
  success: false;
}

/** Метаданные для создания refresh-сессии */
export interface RefreshSessionMetadata {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

/** Результат валидного refresh-токена */
export interface ValidateRefreshSuccess {
  valid: true;
  userId: string;
  tokenId: string;
  user: { id: string; username: string; role: string };
}

/** Результат невалидного refresh-токена */
export interface ValidateRefreshFailure {
  valid: false;
  reason: "not_found" | "expired" | "revoked" | "recently_consumed" | "token_reuse";
  userId?: string;
}

/**
 * Регистрирует нового пользователя (email + пароль, без телефона).
 */
export async function registerUserService(
  username: string,
  email: string,
  password: string,
  registrationChannel?: RegistrationChannel,
  promoCode?: string,
  registrationContext?: CreateConsentLogsParams,
): Promise<{ success: true; userId: string } | { error: string }> {
  logger.info("Registering new user (email)");
  const result = await registerUserWithCredentials({
    username,
    email,
    password,
    registrationChannel,
    promoCode,
    registrationContext,
  });
  if (!result.ok) {
    const maskedCodes: RegisterCredentialsConflictCode[] = ["USERNAME_TAKEN", "EMAIL_TAKEN"];
    if (maskedCodes.includes(result.code)) {
      return { error: REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE };
    }
    return { error: result.messageRu };
  }
  if (result.wasCreated) {
    void sendWelcomeEmailAfterRegistration(email);
  }
  return { success: true, userId: result.userId };
}

/**
 * Сбрасывает пароль по токену
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  logger.info("Resetting password");
  await resetPasswordByToken(token, password);
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
const USERNAME_REGEX = /^[a-z0-9_]+$/;

/**
 * Смена логина пользователя. Уведомление на email, если указан.
 */
export async function changeUsername(userId: string, newUsername: string): Promise<void> {
  const normalized = newUsername.trim().toLowerCase();

  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    throw new Error("Логин: минимум 3 символа, только латиница, цифры и _");
  }
  if (!USERNAME_REGEX.test(normalized)) {
    throw new Error("Логин: минимум 3 символа, только латиница, цифры и _");
  }

  const currentUser = await readAuthUsernameChangeActor(userId);

  if (!currentUser) {
    throw new Error("Пользователь не найден");
  }

  if (currentUser.username === normalized) {
    return;
  }

  const existing = await readAuthUsernameCandidate(normalized);
  if (existing) {
    throw new Error("Логин уже занят");
  }

  try {
    await updateAuthUsername(userId, normalized);
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      throw new Error("Логин уже занят");
    }
    throw error instanceof Error ? error : new Error("Не удалось сменить логин");
  }

  if (currentUser.email?.trim()) {
    try {
      await sendUsernameChangedNoticeEmail(currentUser.email, normalized);
    } catch (err) {
      logger.error(
        "Не удалось отправить уведомление о смене логина на email",
        err instanceof Error ? err : new Error(String(err)),
        { userId },
      );
    }
  }
}

/**
 * Проверка доступности логина (для live-check при вводе).
 * Нормализация: trim + lowercase, как в changeUsername.
 */
export async function isUsernameAvailable(
  username: string,
  currentUserId?: string,
): Promise<boolean> {
  const normalized = username.trim().toLowerCase();

  if (
    normalized.length < USERNAME_MIN_LENGTH ||
    normalized.length > USERNAME_MAX_LENGTH ||
    !USERNAME_REGEX.test(normalized)
  ) {
    return false;
  }

  if (currentUserId) {
    const currentUser = await readAuthCurrentUsername(currentUserId);
    if (currentUser?.username === normalized) return true;
  }

  const existing = await readAuthUsernameOwner(normalized);

  return !existing || existing.id === currentUserId;
}

// ========== API Auth (login, refresh, logout) ==========

/**
 * Получает минимальные данные пользователя для auth-ответа (id, username, role, phone).
 */
export async function getAuthUserById(
  userId: string,
): Promise<{ id: string; username: string; role: string; phone: string | null } | null> {
  const user = await readAuthUserSummary(userId);
  return user;
}

/**
 * Проверяет учётные данные пользователя (login).
 */
export async function validateCredentials(
  username: string,
  password: string,
): Promise<ValidateCredentialsSuccess | ValidateCredentialsFailure> {
  const normalized = username.toLowerCase().trim();
  const user = await readLoginCredentials(normalized);
  if (!user || user.registrationPending) return { success: false };
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return { success: false };
  return { success: true, user };
}

/**
 * Создаёт refresh-сессию в БД.
 * tokenId и tokenHash генерируются в API, core только сохраняет.
 */
export async function createRefreshSession(
  userId: string,
  tokenId: string,
  tokenHash: string,
  metadata: RefreshSessionMetadata,
): Promise<void> {
  const user = await readAuthRegistrationPending(userId);
  if (!user || user.registrationPending) throw new Error("Registration is not completed");
  await createAuthRefreshToken(userId, tokenId, tokenHash, metadata);
}

/**
 * Валидирует refresh-токен (наличие, срок, revoke).
 */
export async function validateRefreshToken(
  tokenHash: string,
): Promise<ValidateRefreshSuccess | ValidateRefreshFailure> {
  const stored = await readAuthRefreshToken(tokenHash);
  if (!stored) return { valid: false, reason: "not_found" };
  if (stored.revokedAt) {
    // A competing refresh can observe the just-rotated token. Reject without
    // punishing every other device; stale replays still trigger compromise flow.
    if (Date.now() - stored.revokedAt.getTime() < 10_000) {
      return { valid: false, reason: "recently_consumed" };
    }
    return { valid: false, reason: "token_reuse", userId: stored.userId };
  }
  if (stored.expiresAt < new Date()) {
    return { valid: false, reason: "expired" };
  }
  if (stored.user.registrationPending) return { valid: false, reason: "revoked" };
  return {
    valid: true,
    userId: stored.userId,
    tokenId: stored.id,
    user: stored.user,
  };
}

/**
 * Атомарно отзывает старый токен и создаёт новый (rotation).
 */
export class RefreshRotationConflictError extends Error {
  constructor() {
    super("Refresh token already consumed or expired");
    this.name = "RefreshRotationConflictError";
  }
}

export async function rotateRefreshToken(
  oldTokenHash: string,
  userId: string,
  newTokenHash: string,
  newTokenId: string,
  metadata: RefreshSessionMetadata,
): Promise<void> {
  const rotated = await rotateAuthRefreshToken(
    oldTokenHash,
    userId,
    newTokenHash,
    newTokenId,
    metadata,
  );
  if (rotated === "REGISTRATION_PENDING") throw new Error("Registration is not completed");
  if (rotated === "CONFLICT") throw new RefreshRotationConflictError();
}

/**
 * Отзывает refresh-токен по хешу.
 */
export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await revokeAuthRefreshToken(tokenHash);
}

/**
 * Отзывает все refresh-токены пользователя.
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await revokeAllAuthSessions(userId);
}

// ========== VK-only: setVkPhone, setPassword, changePassword ==========

/**
 * Установка номера телефона для VK-пользователя (phone = "vk_...").
 */
export async function setVkPhone(userId: string, phone: string): Promise<void> {
  const user = await readAuthVkPhone(userId);
  if (!user) throw new Error("Пользователь не найден");
  if (!user.phone?.startsWith("vk_")) {
    throw new Error("Смена номера недоступна через этот метод");
  }

  const parsed = parsePhoneNumberFromString(phone, "RU");
  if (!parsed || !parsed.isValid()) {
    throw new Error("Неверный формат номера телефона");
  }
  const formatted = parsed.format("E.164");

  const existing = await readAuthPhoneOwnerExcluding(userId, formatted);
  if (existing) throw new Error("Номер телефона уже занят");

  await updateAuthVkPhone(userId, formatted);
  logger.success("vkPhone set", { userId });
}

/**
 * Установка пароля для VK-only пользователя (passwordSetAt === null).
 */
export async function setPassword(userId: string, newPassword: string): Promise<void> {
  const user = await readAuthPasswordSetAt(userId);
  if (!user) throw new Error("Пользователь не найден");
  if (user.passwordSetAt !== null) {
    throw new Error("Пароль уже установлен, используйте смену пароля");
  }

  newPasswordSchema.parse(newPassword);
  const hash = await bcrypt.hash(newPassword, 12);
  if (!(await setAuthPasswordOnce(userId, hash)))
    throw new Error("Пароль уже установлен, используйте смену пароля");
  logger.success("setPassword completed", { userId });

  const u = await readAuthNotificationEmail(userId);
  if (u?.email?.trim()) {
    await sendPasswordChangedNoticeEmail(u.email).catch((err) =>
      logger.error(
        "Не удалось отправить уведомление после установки пароля",
        err instanceof Error ? err : new Error(String(err)),
        { userId },
      ),
    );
  }
}

/**
 * Смена пароля (для пользователей с passwordSetAt !== null).
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await readAuthPasswordForChange(userId);
  if (!user) throw new Error("Пользователь не найден");
  if (user.passwordSetAt === null) {
    throw new Error("Сначала установите пароль");
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new Error("Неверный текущий пароль");

  newPasswordSchema.parse(newPassword);
  const hash = await bcrypt.hash(newPassword, 12);
  if (!(await changeAuthPasswordCAS(userId, user.password, hash)))
    throw new Error("Неверный текущий пароль");
  logger.success("changePassword completed", { userId });

  const u = await readAuthNotificationEmail(userId);
  if (u?.email?.trim()) {
    await sendPasswordChangedNoticeEmail(u.email).catch((err) =>
      logger.error(
        "Не удалось отправить уведомление после смены пароля",
        err instanceof Error ? err : new Error(String(err)),
        { userId },
      ),
    );
  }
}
