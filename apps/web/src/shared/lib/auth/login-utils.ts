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
import parsePhoneNumberFromString from "libphonenumber-js";

// Проверка статуса подтверждения по имени пользователя
export async function checkUserState(username: string) {
  try {
    console.warn("🔍 checkUserState started for username:", username);

    const phone = await getUserPhoneByUsername(username);
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
  return checkUserConfirmed(phone);
}
// Запрос на сброс пароля через Telegram
export async function sendPasswordResetRequest(username: string, phone: string) {
  try {
    return await sendTelegramPasswordResetRequest(username, phone);
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
    // Серверная валидация
    const errors: string[] = [];

    // Валидация имени пользователя
    if (!name || name.trim().length === 0) {
      errors.push("Имя пользователя обязательно");
    } else if (name.length < 3) {
      errors.push("Имя пользователя должно содержать минимум 3 символа");
    } else if (name.length > 50) {
      errors.push("Имя пользователя не может быть длиннее 50 символов");
    } else if (!/^[A-Za-z0-9_]+$/.test(name)) {
      errors.push("Имя пользователя может содержать только английские буквы, цифры и _");
    }

    // Валидация пароля
    if (!password || password.length === 0) {
      errors.push("Пароль обязателен");
    } else if (password.length < 6) {
      errors.push("Пароль должен содержать минимум 6 символов");
    } else if (password.length > 100) {
      errors.push("Пароль не может быть длиннее 100 символов");
    }

    // Валидация телефона
    if (!phone || phone.trim().length === 0) {
      errors.push("Номер телефона обязателен");
    } else {
      const phoneNumber = parsePhoneNumberFromString(phone, "RU");
      if (!phoneNumber || !phoneNumber.isValid()) {
        errors.push("Неверный формат номера телефона");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Ошибка валидации: ${errors.join(", ")}`);
    }

    return await registerUser(name, phone, password);
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
    await resetPasswordByToken(token, password);
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
    const dbPhone = await getUserPhoneByUsername(username);
    if (!dbPhone) return false;

    // Нормализуем оба номера
    const inputPhone = parsePhoneNumberFromString(phone, "RU")?.format("E.164");
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
