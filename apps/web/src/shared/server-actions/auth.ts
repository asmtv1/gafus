"use server";

/**
 * Auth Server Actions - обёртки над authService для Web
 */

import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { authOptions } from "@gafus/auth";
import { getCurrentUserId } from "@gafus/auth/server";
import * as authService from "@gafus/core/services/auth";
import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "@gafus/core/services/consent";
import { createWebLogger } from "@gafus/logger";
import {
  deletePendingConfirmCookie,
  getPendingConfirmPhone,
  setPendingConfirmCookie,
} from "@shared/lib/pendingConfirmCookie";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "@shared/lib/vkIdPkce";
import {
  checkAuthRateLimit,
  getClientIpFromHeaders,
} from "@shared/lib/rateLimit";
import {
  consentPayloadSchema,
  newPasswordSchema,
  phoneChangeConfirmSchema,
  phoneSchema,
  registerUserSchema,
  resetPasswordByCodeSchema,
  resetPasswordSchema,
  tempSessionIdSchema,
  usernameChangeSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";

import { CONSENT_VERSION } from "@shared/constants/consent";
import type { ConsentPayload } from "@shared/constants/consent";

const logger = createWebLogger("auth-actions");

/**
 * Подготавливает конфиг для VK ID One Tap: rate limit, PKCE, cookie, возвращает параметры для SDK.
 * @param returnPath - куда редиректить после callback (/login или /register)
 */
export async function prepareVkIdOneTap(returnPath?: string): Promise<
  | { success: true; state: string; codeVerifier: string; clientId: string; redirectUri: string }
  | { success: false; error: string }
> {
  const vkIdDebug =
    process.env.NODE_ENV === "development" ||
    process.env.VK_ID_DEBUG === "true" ||
    process.env.VK_ID_DEBUG === "1";
  if (vkIdDebug) console.log("[VK ID server] prepareVkIdOneTap вызван");

  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "initiate-vk-id")) {
    if (vkIdDebug) console.warn("[VK ID server] prepareVkIdOneTap: rate limit");
    return { success: false, error: "Слишком много запросов. Попробуйте через 15 минут." };
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const state = generateState();

    const cookieStore = await cookies();
    const safeReturn = returnPath === "/" ? "/" : returnPath === "/register" ? "/register" : "/login";
    cookieStore.set("vk_id_state", JSON.stringify({ state, codeVerifier, returnPath: safeReturn }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const clientId = process.env.VK_CLIENT_ID ?? "";
    let redirectUri = process.env.VK_WEB_REDIRECT_URI ?? "";

    // При запросе через ngrok — подставляем Host автоматически (не нужно править .env при смене ngrok URL)
    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
    if (host && /ngrok/i.test(host)) {
      redirectUri = `https://${host}/api/auth/callback/vk-id`;
    }

    if (vkIdDebug) console.log("[VK ID server] prepareVkIdOneTap OK: clientId=", clientId || "(пусто)", "redirectUri=", redirectUri || "(пусто)");

    return { success: true, state, codeVerifier, clientId, redirectUri };
  } catch (error) {
    logger.error("prepareVkIdOneTap failed", error as Error);
    return { success: false, error: "Не удалось инициализировать авторизацию VK ID" };
  }
}

/**
 * Инициирует авторизацию через VK ID (redirect): rate limit, PKCE, cookie, возвращает URL.
 * @param returnPath - куда редиректить после callback (/login или /register)
 */
export async function initiateVkIdAuth(returnPath?: string): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  const vkIdDebug =
    process.env.NODE_ENV === "development" ||
    process.env.VK_ID_DEBUG === "true" ||
    process.env.VK_ID_DEBUG === "1";
  if (vkIdDebug) console.log("[VK ID server] initiateVkIdAuth вызван");

  const prepared = await prepareVkIdOneTap(returnPath);
  if (!prepared.success) {
    if (vkIdDebug) console.warn("[VK ID server] initiateVkIdAuth: prepareVkIdOneTap failed", prepared.error);
    return prepared;
  }

  const codeChallenge = generateCodeChallenge(prepared.codeVerifier);
  const url =
    `https://id.vk.ru/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(prepared.clientId)}` +
    `&redirect_uri=${encodeURIComponent(prepared.redirectUri)}` +
    `&state=${encodeURIComponent(prepared.state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  if (vkIdDebug) console.log("[VK ID server] initiateVkIdAuth OK, url (первые 80 символов):", url.slice(0, 80) + "...");
  return { success: true, url };
}

/**
 * Инициирует привязку VK аккаунта (redirect). Требует авторизации.
 */
export async function initiateVkIdLink(): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Необходима авторизация" };
  }

  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "vk-id-link")) {
    return { success: false, error: "Слишком много запросов. Попробуйте через 15 минут." };
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const state = generateState();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const cookieStore = await cookies();
    cookieStore.set(
      "vk_id_state",
      JSON.stringify({ state, codeVerifier, mode: "link", returnPath: "/profile" }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      },
    );

    const clientId = process.env.VK_CLIENT_ID ?? "";
    let redirectUri = process.env.VK_WEB_REDIRECT_URI ?? "";

    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
    if (host && /ngrok/i.test(host)) {
      redirectUri = `https://${host}/api/auth/callback/vk-id`;
    }

    const url =
      `https://id.vk.ru/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256`;

    return { success: true, url };
  } catch (error) {
    logger.error("initiateVkIdLink failed", error as Error);
    return { success: false, error: "Не удалось инициализировать привязку VK" };
  }
}

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
  tempSessionId: string,
  consentPayload: ConsentPayload,
): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "register")) {
    return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  }

  const parsed = registerUserSchema.safeParse({ name, phone, password });
  if (!parsed.success) {
    const message = parsed.error.errors.map((issue) => issue.message).join(", ");
    return { error: `Ошибка валидации: ${message}` };
  }

  const consentParsed = consentPayloadSchema.safeParse(consentPayload);
  if (!consentParsed.success) {
    return { error: "Необходимо принять все согласия" };
  }

  const sessionParsed = tempSessionIdSchema.safeParse(tempSessionId);
  if (!sessionParsed.success) {
    return { error: "Некорректный идентификатор сессии" };
  }

  const safeSessionId = sessionParsed.data;
  const userAgent = (await headers()).get("user-agent") ?? undefined;

  let consentCreated = false;
  try {
    await createConsentLogs({
      tempSessionId: safeSessionId,
      consentPayload: consentParsed.data,
      formData: { name: parsed.data.name, phone: parsed.data.phone },
      ipAddress: ip,
      userAgent,
      defaultVersion: CONSENT_VERSION,
    });
    consentCreated = true;

    const result = await authService.registerUserService(
      parsed.data.name,
      parsed.data.phone,
      parsed.data.password,
    );

    if ("error" in result) {
      await markConsentLogsFailed(safeSessionId);
      return { error: result.error };
    }

    await linkConsentLogsToUser(safeSessionId, result.userId);
    await setPendingConfirmCookie(parsed.data.phone);
    return { success: true };
  } catch (error) {
    if (consentCreated) {
      await markConsentLogsFailed(safeSessionId).catch(() => undefined);
    }
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

/**
 * Запрос кода смены телефона (отправка в Telegram).
 */
export async function requestPhoneChangeAction(): Promise<{
  success?: true;
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "phone-change-request")) {
    return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  }
  try {
    await authService.requestPhoneChange(session.user.id);
    logger.info("phone-change-request success", { userId: session.user.id });
    return { success: true };
  } catch (error) {
    logger.error("requestPhoneChangeAction failed", error as Error, { userId: session.user.id });
    return { error: error instanceof Error ? error.message : "Не удалось отправить код" };
  }
}

/**
 * Подтверждение смены телефона по коду из Telegram.
 */
export async function confirmPhoneChangeAction(
  code: string,
  newPhone: string,
): Promise<{ success?: true; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "phone-change-confirm")) {
    return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  }
  try {
    const parsed = phoneChangeConfirmSchema.parse({ code, newPhone });
    await authService.confirmPhoneChange(parsed.code, parsed.newPhone);
    revalidatePath("/profile");
    logger.info("phone-change-confirm success", { userId: session.user.id });
    return { success: true };
  } catch (error) {
    logger.error("confirmPhoneChangeAction failed", error as Error, { userId: session.user.id });
    const message = error instanceof Error ? error.message : "Не удалось сменить номер";
    return { error: message };
  }
}

/**
 * Смена логина. Возвращает normalized username для обновления сессии на клиенте.
 */
/**
 * Установка пароля для VK-only пользователя.
 */
export async function setPasswordAction(
  newPassword: string,
): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "set-password")) {
    return { error: "Слишком много попыток, подождите" };
  }
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Необходима авторизация" };
  try {
    const parsed = newPasswordSchema.safeParse(newPassword);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Ошибка валидации" };
    await authService.setPassword(userId, parsed.data);
    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    logger.error("setPasswordAction failed", error as Error);
    return { error: error instanceof Error ? error.message : "Не удалось установить пароль" };
  }
}

/**
 * Смена пароля (для пользователей с установленным паролем).
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "change-password")) {
    return { error: "Слишком много попыток, подождите" };
  }
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Необходима авторизация" };
  try {
    const parsed = newPasswordSchema.safeParse(newPassword);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Ошибка валидации" };
    await authService.changePassword(userId, currentPassword, parsed.data);
    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    logger.error("changePasswordAction failed", error as Error);
    return { error: error instanceof Error ? error.message : "Не удалось сменить пароль" };
  }
}

/**
 * Установка номера телефона для VK-пользователя.
 */
export async function setVkPhoneAction(phone: string): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "vk-phone-set")) {
    return { error: "Слишком много попыток, подождите" };
  }
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Необходима авторизация" };
  try {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Ошибка валидации" };
    await authService.setVkPhone(userId, parsed.data);
    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    logger.error("setVkPhoneAction failed", error as Error);
    return { error: error instanceof Error ? error.message : "Не удалось установить номер" };
  }
}

export async function changeUsernameAction(newUsername: string): Promise<{
  success?: true;
  username?: string;
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "username-change")) {
    return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  }
  try {
    const parsed = usernameChangeSchema.parse({ newUsername });
    await authService.changeUsername(session.user.id, parsed.newUsername);
    revalidatePath("/profile");
    const normalized = parsed.newUsername.trim().toLowerCase();
    logger.info("username-change success", { userId: session.user.id, newUsername: normalized });
    return { success: true, username: normalized };
  } catch (error) {
    logger.error("changeUsernameAction failed", error as Error, { userId: session.user.id });
    return { error: error instanceof Error ? error.message : "Не удалось сменить логин" };
  }
}

export async function checkUsernameAvailableAction(
  username: string,
): Promise<{ available: boolean } | { error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Не авторизован" };

  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "username-available")) {
    return { error: "Слишком много запросов" };
  }

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: "Некорректный формат логина" };
  }

  try {
    const available = await authService.isUsernameAvailable(parsed.data, userId);
    return { available };
  } catch (error) {
    logger.error("checkUsernameAvailableAction error", error as Error);
    return { error: "Ошибка проверки" };
  }
}

