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

import {
  phoneSchema,
  registerUserSchema,
  resetPasswordSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";

// Проверка статуса подтверждения по имени пользователя
export async function checkUserState(username: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    console.warn("🔍 checkUserState started for username:", username);

    const phone = await getUserPhoneByUsername(safeUsername);
    console.warn("📱 Found phone:", phone);

    if (!phone) {
      console.warn("❌ No phone found for user");
      return { confirmed: false, phone: null };
    }

    const confirmed = await checkUserConfirmed(phone);
    console.warn("✅ User confirmed status:", confirmed);

    return { confirmed, phone };
  } catch (error) {
    console.error("❌ Error in checkUserState:", error);

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
    console.error("❌ Error in sendPasswordResetRequest:", error);

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
    console.error("❌ Error in registerUserAction:", error);

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
    console.error("❌ Error in resetPassword:", error);

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
    console.error("❌ Error in checkPhoneMatchesUsername:", error);

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
