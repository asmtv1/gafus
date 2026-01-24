/**
 * Auth Service - бизнес-логика аутентификации
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Server Actions являются тонкими обёртками над этими функциями.
 */

import {
  checkUserConfirmed,
  getUserPhoneByUsername,
  sendTelegramPasswordResetRequest,
  resetPasswordByToken,
  registerUser,
} from "@gafus/auth";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("auth-service");

/**
 * Проверяет статус подтверждения пользователя по имени
 * @param username - Имя пользователя
 * @returns Объект с информацией о подтверждении и телефоне
 */
export async function checkUserState(username: string): Promise<{
  confirmed: boolean;
  phone: string | null;
}> {
  logger.info("Checking user state", { username });

  const phone = await getUserPhoneByUsername(username);

  if (!phone) {
    logger.warn("No phone found for user", { username });
    return { confirmed: false, phone: null };
  }

  const confirmed = await checkUserConfirmed(phone);
  logger.info("User confirmed status", { confirmed, phone });

  return { confirmed, phone };
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
  logger.info("Sending password reset request", { username });
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
  logger.info("Registering new user", { name, phone });
  return registerUser(name, phone, password);
}

/**
 * Сбрасывает пароль по токену
 * @param token - Токен сброса пароля
 * @param password - Новый пароль
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  logger.info("Resetting password");
  await resetPasswordByToken(token, password);
}

/**
 * Проверяет совпадение номера телефона с номером в базе
 * @param username - Имя пользователя
 * @param phone - Номер телефона для проверки
 * @returns true если номера совпадают
 */
export async function checkPhoneMatchesUsername(username: string, phone: string): Promise<boolean> {
  logger.info("Checking phone matches username", { username });

  const dbPhone = await getUserPhoneByUsername(username);
  if (!dbPhone) return false;

  // Нормализуем оба номера
  const inputPhone = parsePhoneNumberFromString(phone, "RU")?.format("E.164");
  const storedPhone = parsePhoneNumberFromString(dbPhone, "RU")?.format("E.164");

  return inputPhone === storedPhone;
}
