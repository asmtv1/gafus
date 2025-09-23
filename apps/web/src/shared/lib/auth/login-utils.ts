// src/app/actions/login-utils.ts (или другое место)
"use server";

import {
  checkUserConfirmed,
  getUserPhoneByUsername,
  sendTelegramPasswordResetRequest,
  resetPasswordByToken,
  registerUser,
} from "@gafus/auth";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { createWebLogger } from "@gafus/logger";

import {
  phoneSchema,
  registerUserSchema,
  resetPasswordSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";

// Создаем логгер для login-utils
const logger = createWebLogger('web-login-utils');

// Проверка статуса подтверждения по имени пользователя
export async function checkUserState(username: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    logger.info("🔍 checkUserState started for username", {
      operation: 'check_user_state_start',
      username: username
    });

    const phone = await getUserPhoneByUsername(safeUsername);
    logger.info("📱 Found phone", {
      operation: 'found_phone',
      phone: phone
    });

    if (!phone) {
      logger.warn("❌ No phone found for user", {
        operation: 'no_phone_found',
        username: username
      });
      return { confirmed: false, phone: null };
    }

    const confirmed = await checkUserConfirmed(phone);
    logger.info("✅ User confirmed status", {
      operation: 'user_confirmed_status',
      confirmed: confirmed,
      phone: phone
    });

    return { confirmed, phone };
  } catch (error) {
    logger.error("❌ Error in checkUserState", error as Error, {
      operation: 'check_user_state_error',
      username: username
    });

    // Отправляем ошибку в дашборд
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in checkUserState",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "checkUserState",
        username,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["auth", "checkUserState", "server-action"],
    });

    throw new Error("Что-то пошло не так при проверке пользователя");
  }
}
// Проверка подтверждения по телефону
export async function serverCheckUserConfirmed(phone: string) {
  const safePhone = phoneSchema.parse(phone);
  return checkUserConfirmed(safePhone);
}
// Запрос на сброс пароля через Telegram
export async function sendPasswordResetRequest(username: string, phone: string) {
  try {
    const { name: safeUsername, phone: safePhone } = registerUserSchema
      .pick({ name: true, phone: true })
      .parse({ name: username, phone });

    return await sendTelegramPasswordResetRequest(safeUsername, safePhone);
  } catch (error) {
    logger.error("❌ Error in sendPasswordResetRequest", error as Error, {
      operation: 'send_password_reset_request_error',
      username: username,
      phone: phone
    });

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in sendPasswordResetRequest",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "sendPasswordResetRequest",
        username,
        phone,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["auth", "password-reset", "server-action"],
    });

    throw new Error("Что-то пошло не так при отправке запроса на сброс пароля");
  }
}
// Регистрация нового пользователя
export async function registerUserAction(name: string, phone: string, password: string) {
  try {
    const result = registerUserSchema.safeParse({ name, phone, password });

    if (!result.success) {
      const message = result.error.errors.map((issue) => issue.message).join(", ");
      throw new Error(`Ошибка валидации: ${message}`);
    }

    return await registerUser(result.data.name, result.data.phone, result.data.password);
  } catch (error) {
    logger.error("❌ Error in registerUserAction", error as Error, {
      operation: 'register_user_action_error',
      name,
      phone
    });

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in registerUserAction",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "registerUserAction",
        name,
        phone,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["auth", "registration", "server-action"],
    });

    throw new Error("Что-то пошло не так при регистрации пользователя");
  }
}
// Сброс пароля по токену
export default async function resetPassword(token: string, password: string) {
  try {
    const { token: safeToken, password: safePassword } = resetPasswordSchema.parse({ token, password });
    await resetPasswordByToken(safeToken, safePassword);
  } catch (error) {
    logger.error("❌ Error in resetPassword", error as Error, {
      operation: 'reset_password_error',
      token: token,
      password: password
    });

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in resetPassword",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "resetPassword",
        token: token.substring(0, 10) + "...", // Не логируем полный токен
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["auth", "password-reset", "server-action"],
    });

    throw new Error("Что-то пошло не так при сбросе пароля");
  }
}
// Проверка совпадения номера из формы с номером в базе
export async function checkPhoneMatchesUsername(username: string, phone: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    const safePhone = phoneSchema.parse(phone);

    const dbPhone = await getUserPhoneByUsername(safeUsername);
    if (!dbPhone) return false;

    // Нормализуем оба номера
    const inputPhone = parsePhoneNumberFromString(safePhone, "RU")?.format("E.164");
    const storedPhone = parsePhoneNumberFromString(dbPhone, "RU")?.format("E.164");

    return inputPhone === storedPhone;
  } catch (error) {
    logger.error("❌ Error in checkPhoneMatchesUsername", error as Error, {
      operation: 'check_phone_matches_username_error',
      username: username,
      phone: phone
    });

    await reportErrorToDashboard({
      message:
        error instanceof Error ? error.message : "Unknown error in checkPhoneMatchesUsername",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "checkPhoneMatchesUsername",
        username,
        phone,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["auth", "phone-check", "server-action"],
    });

    throw new Error("Что-то пошло не так при проверке номера телефона");
  }
}
