"use server";

/**
 * Auth Server Actions - обёртки над authService для Web
 */

import crypto from "crypto";
import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";

import { authOptions, getVkIdUserFromToken } from "@gafus/auth";
import { authRegisterBodySchema } from "@gafus/core/validation/auth-register";
import { getCurrentUserId } from "@gafus/auth/server";
import * as authService from "@gafus/core/services/auth";
import { getErrorMessage } from "@gafus/core/errors";
import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "@gafus/core/services/consent";
import { createWebLogger } from "@gafus/logger";
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
  emailChangeConfirmTokenSchema,
  emailChangeRequestFormSchema,
  passwordResetFormSchema,
  resetPasswordSchema,
  usernameChangeSchema,
  usernameSchema,
} from "@shared/lib/validation/authSchemas";

import { prisma } from "@gafus/prisma";
import { CONSENT_VERSION } from "@shared/constants/consent";
import type { ConsentPayload } from "@shared/constants/consent";

const logger = createWebLogger("auth-actions");

/**
 * Подготавливает конфиг для VK ID One Tap: rate limit, PKCE, cookie, возвращает параметры для SDK.
 * @param returnPath - куда редиректить после callback (/login или /register)
 * @param redirectUriOverride - если задан (с клиента), используется вместо определения по host
 */
export async function prepareVkIdOneTap(
  returnPath?: string,
  redirectUriOverride?: string,
): Promise<
  | { success: true; state: string; codeVerifier: string; codeChallenge: string; clientId: string; redirectUri: string }
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

    const clientId = process.env.VK_CLIENT_ID ?? "";
    let redirectUri = redirectUriOverride ?? process.env.VK_WEB_REDIRECT_URI ?? "";
    if (redirectUriOverride) {
      try {
        const u = new URL(redirectUriOverride);
        const host = u.hostname.toLowerCase();
        const hostAllowed =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "gafus.ru" ||
          host.endsWith(".gafus.ru") ||
          host.includes("ngrok");
        const pathOk = u.pathname === "/api/auth/callback/vk-id";
        if (!pathOk || !hostAllowed) redirectUri = "";
      } catch {
        redirectUri = "";
      }
    }
    if (!redirectUri) {
      const headersList = await headers();
      const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
      const proto = headersList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
      if (host) {
        if (/ngrok/i.test(host)) {
          redirectUri = `https://${host}/api/auth/callback/vk-id`;
        } else if (/localhost|127\.0\.0\.1/i.test(host)) {
          redirectUri = `${proto}://${host}/api/auth/callback/vk-id`;
        }
      }
    }
    if (!redirectUri) {
      return { success: false, error: "redirect_uri не определён. Добавьте VK_WEB_REDIRECT_URI или откройте через ngrok." };
    }

    const codeChallenge = generateCodeChallenge(codeVerifier);
    if (vkIdDebug) console.log("[VK ID server] prepareVkIdOneTap OK: clientId=", clientId || "(пусто)", "redirectUri=", redirectUri || "(пусто)");

    return { success: true, state, codeVerifier, codeChallenge, clientId, redirectUri };
  } catch (error) {
    logger.error("prepareVkIdOneTap failed", error as Error);
    return { success: false, error: "Не удалось инициализировать авторизацию VK ID" };
  }
}

/**
 * Инициирует авторизацию через VK ID (redirect): rate limit, PKCE, cookie, возвращает URL.
 * @param returnPath - куда редиректить после callback (/login или /register)
 * @param redirectUriOverride - redirect_uri с клиента (window.location.origin + /api/auth/callback/vk-id)
 */
export async function initiateVkIdAuth(
  returnPath?: string,
  redirectUriOverride?: string,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const vkIdDebug =
    process.env.NODE_ENV === "development" ||
    process.env.VK_ID_DEBUG === "true" ||
    process.env.VK_ID_DEBUG === "1";
  if (vkIdDebug) console.log("[VK ID server] initiateVkIdAuth вызван");

  const prepared = await prepareVkIdOneTap(returnPath, redirectUriOverride);
  if (!prepared.success) {
    if (vkIdDebug) console.warn("[VK ID server] initiateVkIdAuth: prepareVkIdOneTap failed", prepared.error);
    return prepared;
  }

  const safeReturn = returnPath === "/" ? "/" : returnPath === "/register" ? "/register" : "/login";
  const cookieStore = await cookies();
  cookieStore.set(
    "vk_id_state",
    JSON.stringify({
      state: prepared.state,
      codeVerifier: prepared.codeVerifier,
      returnPath: safeReturn,
      redirectUri: prepared.redirectUri,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    },
  );

  const codeChallenge = generateCodeChallenge(prepared.codeVerifier);
  const url =
    `https://id.vk.ru/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(prepared.clientId)}` +
    `&redirect_uri=${encodeURIComponent(prepared.redirectUri)}` +
    `&state=${encodeURIComponent(prepared.state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256` +
    `&scope=${encodeURIComponent(authService.VK_ID_OAUTH_SCOPE)}` +
    `&lang_id=0` + // RUS — русский язык для first_name/last_name
    `&fastAuthEnabled=1`; // не показывать экран подтверждения повторно

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

    const clientId = process.env.VK_CLIENT_ID ?? "";
    let redirectUri = process.env.VK_WEB_REDIRECT_URI ?? "";

    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
    const proto = headersList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
    if (host && !redirectUri) {
      if (/ngrok/i.test(host)) {
        redirectUri = `https://${host}/api/auth/callback/vk-id`;
      } else if (/localhost|127\.0\.0\.1/i.test(host)) {
        redirectUri = `${proto}://${host}/api/auth/callback/vk-id`;
      }
    }

    const cookieStore = await cookies();
    cookieStore.set(
      "vk_id_state",
      JSON.stringify({ state, codeVerifier, mode: "link", returnPath: "/profile", redirectUri }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      },
    );

    const url =
      `https://id.vk.ru/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&scope=${encodeURIComponent(authService.VK_ID_OAUTH_SCOPE)}` +
      `&lang_id=0` + // RUS — русский язык для first_name/last_name
      `&fastAuthEnabled=1`; // не показывать экран подтверждения повторно

    return { success: true, url };
  } catch (error) {
    logger.error("initiateVkIdLink failed", error as Error);
    return { success: false, error: "Не удалось инициализировать привязку VK" };
  }
}

/**
 * Проверяет rate limit для логина. Вызывать перед signIn.
 */
export async function checkLoginRateLimit(): Promise<{ allowed: boolean }> {
  const ip = await getClientIpFromHeaders();
  return { allowed: checkAuthRateLimit(ip, "login") };
}

/**
 * Запрос сброса пароля — письмо на email.
 */
export async function sendPasswordResetRequestAction(email: string): Promise<void> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "password-reset-request")) {
    throw new Error("Слишком много запросов. Попробуйте позже.");
  }
  try {
    const { email: safeEmail } = passwordResetFormSchema.pick({ email: true }).parse({ email });
    await authService.sendPasswordResetRequestByEmail(safeEmail);
  } catch (error) {
    logger.error("Error in sendPasswordResetRequestAction", error as Error);
    throw new Error(
      getErrorMessage(error, "Что-то пошло не так при отправке запроса на сброс пароля"),
    );
  }
}

/**
 * Регистрирует нового пользователя (email + пароль).
 * Сессию NextAuth создаёт клиент через signIn после успеха.
 */
export async function registerUserAction(
  name: string,
  email: string,
  password: string,
  tempSessionId: string,
  consentPayload: ConsentPayload,
): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "register")) {
    return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  }

  const parsed = authRegisterBodySchema.safeParse({
    name,
    email,
    password,
    tempSessionId,
    consentPayload,
  });
  if (!parsed.success) {
    const message = parsed.error.errors.map((issue) => issue.message).join(", ");
    return { error: `Ошибка валидации: ${message}` };
  }

  const {
    name: safeName,
    email: safeEmail,
    password: safePassword,
    tempSessionId: safeSessionId,
    consentPayload: safeConsent,
  } = parsed.data;
  const userAgent = (await headers()).get("user-agent") ?? undefined;

  let consentCreated = false;
  try {
    await createConsentLogs({
      tempSessionId: safeSessionId,
      consentPayload: safeConsent,
      formData: { name: safeName, email: safeEmail },
      ipAddress: ip,
      userAgent,
      defaultVersion: CONSENT_VERSION,
    });
    consentCreated = true;

    const result = await authService.registerUserService(
      safeName,
      safeEmail,
      safePassword,
    );

    if ("error" in result) {
      await markConsentLogsFailed(safeSessionId);
      return { error: result.error };
    }

    await linkConsentLogsToUser(safeSessionId, result.userId);
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    if (consentCreated) {
      await markConsentLogsFailed(safeSessionId).catch(() => undefined);
    }
    logger.error(
      "Error in registerUserAction",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { error: "Что-то пошло не так при регистрации пользователя" };
  }
}

/**
 * Согласия для новых VK-пользователей. Создаёт ConsentLog, привязывает к userId.
 * Токен не потребляется — клиент вызовет signIn после успеха.
 */
export async function submitVkConsentAction(
  vkIdToken: string,
  consentPayload: ConsentPayload,
): Promise<{ success: true } | { success: false; error: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "register")) {
    return { success: false, error: "Слишком много запросов. Попробуйте через 15 минут." };
  }

  const vkUser = await getVkIdUserFromToken(vkIdToken);
  if (!vkUser) {
    return { success: false, error: "Ссылка устарела. Повторите вход через VK." };
  }

  const consentParsed = consentPayloadSchema.safeParse(consentPayload);
  if (!consentParsed.success) {
    return { success: false, error: "Необходимо принять все согласия" };
  }

  const user = await prisma.user.findUnique({
    where: { id: vkUser.userId },
    select: { phone: true, email: true },
  });
  if (!user) {
    return { success: false, error: "Пользователь не найден." };
  }

  const tempSessionId = crypto.randomUUID();
  const userAgent = (await headers()).get("user-agent") ?? undefined;

  try {
    await createConsentLogs({
      tempSessionId,
      consentPayload: consentParsed.data,
      formData: {
        name: vkUser.username,
        phone: user.phone ?? undefined,
        email: user.email ?? undefined,
      },
      ipAddress: ip,
      userAgent,
      defaultVersion: CONSENT_VERSION,
    });
    await linkConsentLogsToUser(tempSessionId, vkUser.userId);
    return { success: true };
  } catch (error) {
    logger.error("submitVkConsentAction failed", error as Error);
    return { success: false, error: "Не удалось сохранить согласия. Попробуйте снова." };
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
 * Запрос смены email: письмо со ссылкой на новый адрес.
 */
export async function requestEmailChangeAction(
  newEmail: string,
): Promise<{ success?: true; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "Не авторизован" };
  }
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "email-change-request")) {
    return { error: "Слишком много запросов. Попробуйте через 15 минут." };
  }
  try {
    const parsed = emailChangeRequestFormSchema.parse({ newEmail });
    await authService.requestEmailChange(session.user.id, parsed.newEmail);
    logger.info("email-change-request success", { userId: session.user.id });
    return { success: true };
  } catch (error) {
    logger.error("requestEmailChangeAction failed", error as Error, { userId: session.user.id });
    return { error: getErrorMessage(error, "Не удалось отправить письмо") };
  }
}

/**
 * Подтверждение смены email по токену из письма (публичная страница).
 */
export async function confirmEmailChangeByTokenAction(
  token: string,
): Promise<{ success?: true; error?: string }> {
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "email-change-confirm")) {
    return { error: "Слишком много попыток. Попробуйте позже." };
  }
  try {
    const { token: safeToken } = emailChangeConfirmTokenSchema.parse({ token });
    await authService.confirmEmailChangeByToken(safeToken);
    // Страница /profile/confirm-email вызывает action при RSC-render — revalidatePath
    // в том же коллстеке запрещён; откладываем до завершения ответа (next/server after).
    after(() => {
      revalidatePath("/profile");
    });
    logger.info("email-change-confirm success");
    return { success: true };
  } catch (error) {
    logger.error("confirmEmailChangeByTokenAction failed", error as Error);
    return { error: getErrorMessage(error, "Не удалось подтвердить email") };
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
    return { error: getErrorMessage(error, "Не удалось установить пароль") };
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
    return { error: getErrorMessage(error, "Не удалось сменить пароль") };
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
    return { error: getErrorMessage(error, "Не удалось сменить логин") };
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

