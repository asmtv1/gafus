/**
 * Auth Service - бизнес-логика аутентификации
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Server Actions являются тонкими обёртками над этими функциями.
 */

import {
  checkUserConfirmed,
  confirmPhoneChangeByShortCode,
  getUserPhoneByUsername,
  maskPhone,
  resetPasswordByShortCode,
  resetPasswordByToken,
  registerUser,
  sendTelegramPasswordResetRequest,
  sendTelegramUsernameChangeNotification,
  sendTelegramPhoneChangeRequest,
} from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-service");

/**
 * Проверяет статус подтверждения пользователя по имени.
 * Не возвращает phone клиенту — только phoneHint (маска) и needsConfirm.
 */
export async function checkUserState(username: string): Promise<{
  confirmed: boolean;
  phoneHint?: string;
  needsConfirm?: boolean;
}> {
  logger.info("Checking user state", { username });

  const phone = await getUserPhoneByUsername(username);

  if (!phone) {
    logger.warn("No phone found for user", { username });
    return { confirmed: false };
  }

  const confirmed = await checkUserConfirmed(phone);
  logger.info("User confirmed status", { confirmed, username });

  return {
    confirmed,
    phoneHint: maskPhone(phone),
    needsConfirm: !confirmed,
  };
}

/**
 * Проверяет подтверждение пользователя по номеру телефона
 * @param phone - Номер телефона
 * @returns true если пользователь подтверждён
 */
export async function serverCheckUserConfirmed(phone: string): Promise<boolean> {
  return checkUserConfirmed(phone);
}

/**
 * Отправляет запрос на сброс пароля через Telegram
 * @param username - Имя пользователя
 * @param phone - Номер телефона
 * @returns Результат отправки
 */
export async function sendPasswordResetRequest(username: string, phone: string) {
  logger.info("Sending password reset request");
  return sendTelegramPasswordResetRequest(username, phone);
}

/**
 * Регистрирует нового пользователя
 * @param name - Имя пользователя
 * @param phone - Номер телефона
 * @param password - Пароль
 * @returns Результат регистрации
 */
export async function registerUserService(name: string, phone: string, password: string) {
  logger.info("Registering new user");
  return registerUser(name, phone, password);
}

/**
 * Сбрасывает пароль по токену
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  logger.info("Resetting password");
  await resetPasswordByToken(token, password);
}

/**
 * Сбрасывает пароль по 6-значному коду из Telegram
 */
export async function resetPasswordByCode(code: string, password: string): Promise<void> {
  logger.info("Resetting password by code");
  await resetPasswordByShortCode(code, password);
}

/**
 * Запрос кода смены телефона (отправка в Telegram).
 */
export async function requestPhoneChange(userId: string): Promise<void> {
  logger.info("Requesting phone change", { userId });
  await sendTelegramPhoneChangeRequest(userId);
}

/**
 * Подтверждение смены телефона по коду из Telegram.
 */
export async function confirmPhoneChange(code: string, newPhone: string): Promise<void> {
  await confirmPhoneChangeByShortCode(code, newPhone);
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
const USERNAME_REGEX = /^[a-z0-9_]+$/;

/**
 * Смена логина пользователя. Валидация формата и уникальности, обновление в БД, уведомление в Telegram.
 */
export async function changeUsername(userId: string, newUsername: string): Promise<void> {
  const normalized = newUsername.trim().toLowerCase();

  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    throw new Error("Логин: минимум 3 символа, только латиница, цифры и _");
  }
  if (!USERNAME_REGEX.test(normalized)) {
    throw new Error("Логин: минимум 3 символа, только латиница, цифры и _");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, telegramId: true },
  });

  if (!currentUser) {
    throw new Error("Пользователь не найден");
  }

  if (currentUser.username === normalized) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { username: normalized },
  });
  if (existing) {
    throw new Error("Логин уже занят");
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { username: normalized },
    });
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      throw new Error("Логин уже занят");
    }
    throw error instanceof Error ? error : new Error("Не удалось сменить логин");
  }

  if (currentUser.telegramId) {
    try {
      await sendTelegramUsernameChangeNotification(currentUser.telegramId, normalized);
    } catch (err) {
      logger.warn("Не удалось отправить уведомление о смене логина в Telegram", { userId, error: err });
    }
  }
}

