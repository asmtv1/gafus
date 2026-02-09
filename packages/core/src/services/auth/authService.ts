/**
 * Auth Service - бизнес-логика аутентификации
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Server Actions являются тонкими обёртками над этими функциями.
 */

import {
  checkUserConfirmed,
  getUserPhoneByUsername,
  maskPhone,
  sendTelegramPasswordResetRequest,
  resetPasswordByToken,
  resetPasswordByShortCode,
  registerUser,
} from "@gafus/auth";
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

