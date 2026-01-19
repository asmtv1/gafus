"use server";

/**
 * Auth Server Actions - обёртки над authService для Web
 */

import { createWebLogger } from "@gafus/logger";
import {
  phoneSchema,
  registerUserSchema,
  resetPasswordSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";
import * as authService from "@shared/services/auth/authService";

const logger = createWebLogger('auth-actions');

/**
 * Проверяет статус подтверждения пользователя
 */
export async function checkUserStateAction(username: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    return await authService.checkUserState(safeUsername);
  } catch (error) {
    logger.error("Error in checkUserStateAction", error as Error, { username });
    throw new Error("Что-то пошло не так при проверке пользователя");
  }
}

/**
 * Проверяет подтверждение пользователя по телефону
 */
export async function serverCheckUserConfirmedAction(phone: string) {
  try {
    const safePhone = phoneSchema.parse(phone);
    return await authService.serverCheckUserConfirmed(safePhone);
  } catch (error) {
    logger.error("Error in serverCheckUserConfirmedAction", error as Error);
    throw new Error("Что-то пошло не так при проверке подтверждения");
  }
}

/**
 * Отправляет запрос на сброс пароля
 */
export async function sendPasswordResetRequestAction(username: string, phone: string) {
  try {
    const { name: safeUsername, phone: safePhone } = registerUserSchema
      .pick({ name: true, phone: true })
      .parse({ name: username, phone });

    return await authService.sendPasswordResetRequest(safeUsername, safePhone);
  } catch (error) {
    logger.error("Error in sendPasswordResetRequestAction", error as Error, { username });
    throw new Error("Что-то пошло не так при отправке запроса на сброс пароля");
  }
}

/**
 * Регистрирует нового пользователя
 */
export async function registerUserAction(name: string, phone: string, password: string) {
  try {
    const result = registerUserSchema.safeParse({ name, phone, password });

    if (!result.success) {
      const message = result.error.errors.map((issue) => issue.message).join(", ");
      throw new Error(`Ошибка валидации: ${message}`);
    }

    return await authService.registerUserService(
      result.data.name,
      result.data.phone,
      result.data.password
    );
  } catch (error) {
    logger.error("Error in registerUserAction", error as Error, { name, phone });
    throw new Error("Что-то пошло не так при регистрации пользователя");
  }
}

/**
 * Сбрасывает пароль по токену
 */
export async function resetPasswordAction(token: string, password: string) {
  try {
    const { token: safeToken, password: safePassword } = resetPasswordSchema.parse({
      token,
      password,
    });
    
    await authService.resetPassword(safeToken, safePassword);
    return { success: true };
  } catch (error) {
    logger.error("Error in resetPasswordAction", error as Error);
    throw new Error("Что-то пошло не так при сбросе пароля");
  }
}

/**
 * Проверяет совпадение номера телефона с номером в базе
 */
export async function checkPhoneMatchesUsernameAction(username: string, phone: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    const safePhone = phoneSchema.parse(phone);

    return await authService.checkPhoneMatchesUsername(safeUsername, safePhone);
  } catch (error) {
    logger.error("Error in checkPhoneMatchesUsernameAction", error as Error, { username });
    throw new Error("Что-то пошло не так при проверке номера телефона");
  }
}
