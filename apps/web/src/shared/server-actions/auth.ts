"use server";

/**
 * Auth Server Actions - обёртки над authService для Web
 */

import { createWebLogger } from "@gafus/logger";
import {
  deletePendingConfirmCookie,
  getPendingConfirmPhone,
  setPendingConfirmCookie,
} from "@shared/lib/pendingConfirmCookie";
import {
  checkAuthRateLimit,
  getClientIpFromHeaders,
} from "@shared/lib/rateLimit";
import {
  phoneSchema,
  registerUserSchema,
  resetPasswordByCodeSchema,
  resetPasswordSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";
import * as authService from "@gafus/core/services/auth";

const logger = createWebLogger("auth-actions");

/**
 * Проверяет rate limit для логина. Вызывать перед checkUserStateAction и signIn.
 */
export async function checkLoginRateLimit(): Promise<{ allowed: boolean }> {
  const ip = await getClientIpFromHeaders();
  return { allowed: checkAuthRateLimit(ip, "login") };
}

/**
 * Проверяет статус подтверждения пользователя
 */
export async function checkUserStateAction(username: string) {
  try {
    const safeUsername = usernameSchema.parse(username);
    return await authService.checkUserState(safeUsername);
  } catch (error) {
    logger.error("Error in checkUserStateAction", error as Error);
    throw new Error("Что-то пошло не так при проверке пользователя");
  }
}

/**
 * Статус ожидания подтверждения (для страницы /confirm).
 * Читает cookie, проверяет confirmed по phone. При confirmed очищает cookie.
 */
export async function getPendingConfirmationStatus(): Promise<{
  hasPending: boolean;
  confirmed: boolean;
}> {
  const phone = await getPendingConfirmPhone();
  if (!phone) {
    return { hasPending: false, confirmed: false };
  }
  const confirmed = await authService.serverCheckUserConfirmed(phone);
  if (confirmed) {
    await deletePendingConfirmCookie();
  }
  return { hasPending: true, confirmed };
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
    logger.error("Error in sendPasswordResetRequestAction", error as Error);
    throw new Error("Что-то пошло не так при отправке запроса на сброс пароля");
  }
}

/**
 * Регистрирует нового пользователя.
 * При ошибке валидации возвращает { error }. После успеха ставит cookie pending_confirm и возвращает { success: true }.
 */
export async function registerUserAction(
  name: string,
  phone: string,
  password: string,
): Promise<{ success?: true; error?: string }> {
  const parsed = registerUserSchema.safeParse({ name, phone, password });
  if (!parsed.success) {
    const message = parsed.error.errors.map((issue) => issue.message).join(", ");
    return { error: `Ошибка валидации: ${message}` };
  }

  try {
    const result = await authService.registerUserService(
      parsed.data.name,
      parsed.data.phone,
      parsed.data.password,
    );

    if ("error" in result) {
      return { error: result.error };
    }

    await setPendingConfirmCookie(parsed.data.phone);
    return { success: true };
  } catch (error) {
    logger.error("Error in registerUserAction", error as Error);
    return { error: "Что-то пошло не так при регистрации пользователя" };
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
 * Сбрасывает пароль по 6-значному коду из Telegram
 */
export async function resetPasswordByCodeAction(code: string, password: string) {
  try {
    const { code: safeCode, password: safePassword } = resetPasswordByCodeSchema.parse({
      code,
      password,
    });

    await authService.resetPasswordByCode(safeCode, safePassword);
    return { success: true };
  } catch (error) {
    logger.error("Error in resetPasswordByCodeAction", error as Error);
    throw new Error(
      error instanceof Error ? error.message : "Что-то пошло не так при сбросе пароля",
    );
  }
}

