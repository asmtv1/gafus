/**
 * Auth Routes
 * Endpoints для авторизации: login, register, refresh, logout
 */
import {
  USERNAME_AVAILABILITY_MIN_LENGTH,
  USERNAME_AVAILABILITY_MAX_LENGTH,
  USERNAME_AVAILABILITY_ALLOWED_CHARACTERS,
  type UsernameAvailabilityServiceResponse,
} from "@gafus/types";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import crypto from "crypto";

import {
  authRegisterBodySchema,
  coreRegisterEmailSchema,
  resolveRegistrationChannelFromBody,
} from "@gafus/core/validation/auth-register";
import {
  assertCompletedUser,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "@gafus/auth/jwt";
import { InvalidPasswordResetTokenError } from "@gafus/auth";
import {
  changePassword,
  changeUsername,
  confirmEmailChangeByToken,
  isUsernameAvailable,
  createRefreshSession,
  getAuthUserById,
  REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE,
  registerUserService,
  requestEmailChange,
  resetPassword,
  PASSWORD_RESET_REQUEST_MESSAGE,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  RefreshRotationConflictError,
  sendPasswordResetRequestByEmail,
  setPassword,
  validateCredentials,
  validateRefreshToken,
  previewRegistrationPromoCode,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { passwordResetPort } from "../../modules/auth/composition/password-reset-instance.js";
import { emailAccountRows } from "../../modules/auth/composition/email-account-rows-instance.js";
import { authMiddleware } from "../../middleware/auth.js";
import { registrationContextPort } from "../../modules/auth/composition/registration-context-instance.js";
import { credentialRegistrationPort } from "../../modules/auth/composition/credential-registration-instance.js";
import { registrationContractRows } from "../../modules/auth/composition/registration-contract-rows-instance.js";
import {
  clearBrowserSession,
  getBrowserRefreshToken,
  isBrowserCookieMode,
  isTrustedBrowserOrigin,
  setBrowserSession,
} from "../../lib/browser-auth.js";

const logger = createWebLogger("api-auth");

const CONSENT_VERSION = process.env.CONSENT_VERSION ?? "v1.4 2026-08-13";

export const authRoutes = new Hono();

// Schemas
const loginSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  password: z.string().min(1, "Пароль обязателен"),
});

const refreshSchema = z.object({
  // Native Mobile sends the token in JSON; browser refresh/logout reads HttpOnly cookie.
  refreshToken: z.string().min(1).optional(),
});

const checkPhoneMatchSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  phone: z.string().min(1, "Номер телефона обязателен"),
});

const passwordResetRequestSchema = z.object({
  email: coreRegisterEmailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: z
    .string()
    .min(8, "Минимум 8 символов")
    .max(100, "Максимум 100 символов")
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
});

const emailChangeRequestSchema = z.object({
  newEmail: coreRegisterEmailSchema,
  currentPassword: z.string().min(1).max(100).optional(),
});

const emailChangeConfirmSchema = z.object({
  token: z.string().trim().min(32).max(128),
});

const usernameChangeSchema = z.object({
  newUsername: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Логин: латиница, цифры, _"),
});

// Preserve the original Zod issue codes/order/messages exposed in HTTP 400.
// Constraint values and character policy are shared with browser normalization.
const usernameAvailableQuerySchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_AVAILABILITY_MIN_LENGTH)
    .max(USERNAME_AVAILABILITY_MAX_LENGTH)
    .regex(USERNAME_AVAILABILITY_ALLOWED_CHARACTERS, "Логин: латиница, цифры, _"),
});

const registrationPromoPreviewSchema = z.object({ promoCode: z.string().trim().min(1).max(64) });
const setPasswordApiSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(100)
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
});
const changePasswordApiSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(100)
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
});

const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

// POST /api/v1/auth/login
authRoutes.post(
  "/login",
  bodyLimit({ maxSize: 10 * 1024 }), // 10KB
  zValidator("json", loginSchema),
  async (c) => {
    try {
      const { username, password } = c.req.valid("json");
      const browser = isBrowserCookieMode(c);
      if (browser && !isTrustedBrowserOrigin(c)) {
        return c.json({ success: false, error: "Недоверенный Origin" }, 403);
      }
      const result = await validateCredentials(username, password);

      if (!result.success) {
        logger.warn("Login attempt failed", { username: username.toLowerCase().trim() });
        return c.json({ success: false, error: "Неверные учётные данные" }, 401);
      }

      const { user } = result;
      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER",
      };

      await assertCompletedUser(user.id);
      const tokenId = crypto.randomUUID();
      const accessToken = await generateAccessToken(authUser, tokenId);
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        deviceId: c.req.header("x-device-id"),
        userAgent: c.req.header("user-agent"),
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("User logged in", { userId: user.id, deviceId: c.req.header("x-device-id") });
      if (browser) {
        setBrowserSession(c, accessToken, refreshToken);
        return c.json({
          success: true,
          data: { user: { id: user.id, username: user.username, role: user.role } },
        });
      }

      return c.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, role: user.role },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Login error", error as Error);
      return c.json({ success: false, error: "Ошибка авторизации" }, 500);
    }
  },
);

// POST /api/v1/auth/register
authRoutes.post(
  "/register",
  bodyLimit({ maxSize: 10 * 1024 }),
  zValidator("json", authRegisterBodySchema),
  async (c) => {
    const { name, email, password, tempSessionId, consentPayload, registrationChannel, promoCode } =
      c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0];
    const userAgent = c.req.header("user-agent");
    const browser = isBrowserCookieMode(c);
    if (browser && !isTrustedBrowserOrigin(c)) {
      return c.json({ success: false, error: "Недоверенный Origin" }, 403);
    }

    try {
      const result = await registerUserService(
        name,
        email,
        password,
        resolveRegistrationChannelFromBody(registrationChannel),
        promoCode,
        {
          tempSessionId,
          consentPayload,
          formData: { name, email },
          ipAddress,
          userAgent,
          defaultVersion: CONSENT_VERSION,
        },
        credentialRegistrationPort,
        registrationContractRows,
      );

      if ("error" in result) {
        const isConflict = result.error === REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE;
        return c.json(
          {
            success: false,
            error: isConflict ? REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE : result.error,
          },
          isConflict ? 409 : 400,
        );
      }

      const user = await getAuthUserById(result.userId);
      if (!user) {
        return c.json({ success: false, error: "Ошибка регистрации" }, 500);
      }

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER",
      };
      await assertCompletedUser(user.id);
      const tokenId = crypto.randomUUID();
      const accessToken = await generateAccessToken(authUser, tokenId);
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("User registered via API", { userId: user.id });
      if (browser) {
        setBrowserSession(c, accessToken, refreshToken);
        return c.json({
          success: true,
          data: { user: { id: user.id, username: user.username, role: user.role } },
        });
      }

      return c.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, role: user.role },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      // Never reflect or log internal database/provider/credential error text.
      // Server alerts can be correlated by request id; log only the safe code.
      logger.error("Register error", new Error("REGISTRATION_UNAVAILABLE"));
      return c.json(
        {
          success: false,
          code: "REGISTRATION_UNAVAILABLE",
          error: "Не удалось зарегистрироваться. Попробуйте позже.",
        },
        500,
      );
    }
  },
);

// Public registration preview deliberately validates only the code lifecycle;
// it does not receive a user id or expose subscription eligibility/pricing.
authRoutes.post(
  "/registration-promo-preview",
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", registrationPromoPreviewSchema),
  async (c) => {
    try {
      const promo = await previewRegistrationPromoCode(c.req.valid("json").promoCode, registrationContextPort, registrationContractRows);
      return c.json({ success: true, data: { code: promo!.normalizedCode } });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "PROMO_INVALID";
      return c.json({ success: false, code, error: "Промокод недействителен или недоступен" }, 400);
    }
  },
);

// GET /api/v1/auth/me — unified identity for Web cookie and Mobile Bearer clients.
authRoutes.get("/me", authMiddleware, (c) => {
  const { id, username, role } = c.get("user");
  return c.json({ success: true, data: { id, username, role } }, 200, {
    "Cache-Control": "private, no-store",
  });
});

// POST /api/v1/auth/refresh
authRoutes.post(
  "/refresh",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", refreshSchema),
  async (c) => {
    try {
      const browser = isBrowserCookieMode(c);
      if (browser && !isTrustedBrowserOrigin(c)) {
        return c.json({ success: false, error: "Недоверенный Origin" }, 403);
      }
      const refreshToken = browser ? getBrowserRefreshToken(c) : c.req.valid("json").refreshToken;
      if (!refreshToken) {
        return c.json({ success: false, error: "Нет refresh token" }, browser ? 401 : 400);
      }

      const payload = await verifyRefreshToken(refreshToken);
      if (!payload) {
        return c.json({ success: false, error: "Недействительный refresh token" }, 401);
      }

      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      const result = await validateRefreshToken(tokenHash);

      if (!result.valid) {
        if (result.reason === "recently_consumed") {
          return c.json(
            { success: false, code: "REFRESH_CONFLICT", error: "Сессия уже обновляется" },
            409,
          );
        }
        if (result.reason === "token_reuse" && result.userId) {
          logger.warn("Refresh token reuse detected - possible token theft!", {
            userId: result.userId,
            ip: c.req.header("x-forwarded-for")?.split(",")[0],
          });
          await revokeAllUserTokens(result.userId);
          return c.json(
            {
              success: false,
              error: "Сессия скомпрометирована. Войдите заново.",
              code: "TOKEN_REUSE_DETECTED",
            },
            401,
          );
        }
        return c.json({ success: false, error: "Токен отозван или истёк" }, 401);
      }

      const { user } = result;
      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER",
      };

      await assertCompletedUser(user.id);
      const newTokenId = crypto.randomUUID();
      const newAccessToken = await generateAccessToken(authUser, newTokenId);
      const newRefreshToken = await generateRefreshToken(user.id, newTokenId);
      const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

      try {
        await rotateRefreshToken(tokenHash, user.id, newTokenHash, newTokenId, {
          deviceId: c.req.header("x-device-id"),
          userAgent: c.req.header("user-agent"),
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
          expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
        });
      } catch (error) {
        if (error instanceof RefreshRotationConflictError) {
          return c.json(
            { success: false, code: "REFRESH_CONFLICT", error: "Сессия уже обновляется" },
            409,
          );
        }
        throw error;
      }

      if (browser) {
        setBrowserSession(c, newAccessToken, newRefreshToken);
        return c.json({ success: true }, 200, { "Cache-Control": "no-store" });
      }
      return c.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      logger.error("Refresh token error", error as Error);
      return c.json({ success: false, error: "Ошибка обновления токена" }, 500);
    }
  },
);

// POST /api/v1/auth/logout
authRoutes.post(
  "/logout",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", refreshSchema),
  async (c) => {
    try {
      const browser = isBrowserCookieMode(c);
      if (browser && !isTrustedBrowserOrigin(c)) {
        return c.json({ success: false, error: "Недоверенный Origin" }, 403);
      }
      const refreshToken = browser ? getBrowserRefreshToken(c) : c.req.valid("json").refreshToken;
      if (!browser && !refreshToken) {
        return c.json({ success: false, error: "Требуется refresh token" }, 400);
      }
      if (refreshToken) {
        const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
        await revokeRefreshToken(tokenHash);
      }
      if (browser) clearBrowserSession(c);
      return c.json({ success: true }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      logger.error("Logout error", error as Error);
      // A browser cookie must not be declared revoked if the revocation failed.
      if (isBrowserCookieMode(c)) {
        return c.json({ success: false, error: "Ошибка выхода" }, 503);
      }
      // Never acknowledge a server-side revocation that did not happen.
      return c.json({ success: false, code: "LOGOUT_REVOKE_FAILED", error: "Ошибка выхода" }, 503);
    }
  },
);

// POST /api/v1/auth/logout-all — revoke Web and Mobile sessions for the
// authenticated principal. Core's single transaction invalidates refresh rows
// AND pre-existing access JWTs through sessionsRevokedAt. Do not acknowledge a
// revocation until the transaction has committed.
authRoutes.post("/logout-all", authMiddleware, bodyLimit({ maxSize: 1024 }), async (c) => {
  c.header("Cache-Control", "private, no-store");
  try {
    await revokeAllUserTokens(c.get("user").id);
    if (isBrowserCookieMode(c)) clearBrowserSession(c);
    return c.json({ success: true }, 200);
  } catch {
    logger.error("Logout-all revocation failed", new Error("LOGOUT_ALL_REVOKE_FAILED"));
    return c.json(
      {
        success: false,
        code: "LOGOUT_ALL_REVOKE_FAILED",
        error: "Не удалось завершить все сеансы",
      },
      503,
    );
  }
});

// Legacy telephone ownership check is intentionally not implemented in the
// email-only release flow. Never claim arbitrary pairs are a valid match:
// that would be a fail-open authorization primitive for any legacy caller.
authRoutes.post(
  "/check-phone-match",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", checkPhoneMatchSchema),
  (c) =>
    c.json(
      {
        success: false,
        code: "PHONE_MATCH_UNAVAILABLE",
        error: "Проверка номера недоступна. Восстановите доступ через email.",
      },
      410,
    ),
);

// POST /api/v1/auth/password-reset-request — письмо со ссылкой на email
authRoutes.post(
  "/password-reset-request",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", passwordResetRequestSchema),
  async (c) => {
    try {
      const { email } = c.req.valid("json");
      await sendPasswordResetRequestByEmail(email, emailAccountRows);
      return c.json({ success: true, message: PASSWORD_RESET_REQUEST_MESSAGE });
    } catch (error) {
      logger.error("Password reset request error", error as Error);
      const message = error instanceof Error ? error.message : "Ошибка отправки запроса";
      if (message.includes("Некорректный email")) {
        return c.json({ success: false, error: message }, 400);
      }
      if (message.includes("не настроена") || message.includes("Не удалось отправить письмо")) {
        return c.json({ success: false, error: "Отправка писем временно недоступна" }, 503);
      }
      return c.json({ success: false, error: "Ошибка отправки запроса" }, 500);
    }
  },
);

// POST /api/v1/auth/reset-password — сброс по токену из письма
authRoutes.post(
  "/reset-password",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", resetPasswordSchema),
  async (c) => {
    try {
      const { token, password } = c.req.valid("json");
      await resetPassword(token, password, passwordResetPort);
      return c.json({ success: true });
    } catch (error) {
      logger.error("Reset password error", error as Error);
      if (error instanceof InvalidPasswordResetTokenError) {
        return c.json({ success: false, error: error.message }, 400);
      }
      return c.json({ success: false, error: "Не удалось сбросить пароль" }, 400);
    }
  },
);

// W1 tokens and account-change responses are private and must never be cached,
// including validation failures and early authentication denials.
const emailChangePrivateResponse: import("hono").MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
};

// POST /api/v1/auth/email-change-request: authenticated account owner only.
authRoutes.post(
  "/email-change-request",
  emailChangePrivateResponse,
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", emailChangeRequestSchema),
  async (c) => {
    try {
      const { newEmail, currentPassword } = c.req.valid("json");
      await requestEmailChange(c.get("user").id, newEmail, currentPassword, emailAccountRows);
      return c.json({ success: true });
    } catch (error) {
      // Validation/domain conflicts keep the previously observed 400 envelope.
      // Mail/DB errors are operational failures, not malformed user input;
      // never return raw driver/provider exception messages to the client.
      const message = error instanceof Error ? error.message : "";
      if (
        [
          "Этот email уже указан в профиле",
          "Этот email уже занят",
          "Пользователь не найден",
          "Неверный текущий пароль",
        ].includes(message)
      ) {
        return c.json({ success: false, error: message }, 400);
      }
      logger.error(
        "email-change-request unavailable",
        new Error("EMAIL_CHANGE_REQUEST_UNAVAILABLE"),
      );
      return c.json(
        {
          success: false,
          code: "EMAIL_CHANGE_UNAVAILABLE",
          error: "Не удалось отправить письмо. Попробуйте позже.",
        },
        503,
      );
    }
  },
);

// POST /api/v1/auth/email-change-confirm: public one-time possession token.
authRoutes.post(
  "/email-change-confirm",
  emailChangePrivateResponse,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", emailChangeConfirmSchema),
  async (c) => {
    try {
      const { token } = c.req.valid("json");
      await confirmEmailChangeByToken(token, emailAccountRows);
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        [
          "Ссылка недействительна",
          "Ссылка недействительна или устарела",
          "Этот email уже занят",
        ].includes(message)
      ) {
        return c.json({ success: false, error: message }, 400);
      }
      // Don't include raw token / Prisma error / provider response in log or JSON.
      logger.error(
        "email-change-confirm unavailable",
        new Error("EMAIL_CHANGE_CONFIRM_UNAVAILABLE"),
      );
      return c.json(
        {
          success: false,
          code: "EMAIL_CHANGE_UNAVAILABLE",
          error: "Не удалось подтвердить email. Попробуйте позже.",
        },
        503,
      );
    }
  },
);

// Older mobile builds must not silently retry an OAuth flow that was removed.
const vkRetiredResponse = (c: import("hono").Context) =>
  c.json({
    success: false,
    code: "VK_AUTH_RETIRED",
    error: "Вход через VK больше не поддерживается. Восстановите пароль по email или обратитесь в поддержку GAFUS.",
  }, 410);
for (const path of ["/vk", "/vk-consent", "/vk-consent/:contextToken", "/vk-phone-set", "/vk-link"]) {
  authRoutes.all(path, vkRetiredResponse);
}

// W1 G02 password mutations are sensitive even on unauthenticated/invalid
// requests: pre-auth middleware ensures early 401/403/validation cannot cache.
const passwordPrivateResponse: import("hono").MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
};

// POST /api/v1/auth/set-password (authenticated account with no password).
authRoutes.post(
  "/set-password",
  passwordPrivateResponse,
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", setPasswordApiSchema),
  async (c) => {
    try {
      const { newPassword } = c.req.valid("json");
      const userId = c.get("user").id;
      await setPassword(userId, newPassword);
      return c.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const safeMessages = [
        "Пользователь не найден",
        "Пароль уже установлен, используйте смену пароля",
      ];
      if (safeMessages.includes(msg)) {
        return c.json({ success: false, error: msg }, 400);
      }
      logger.error("set-password unavailable", new Error("SET_PASSWORD_OPERATION_UNAVAILABLE"));
      return c.json(
        {
          success: false,
          code: "PASSWORD_OPERATION_UNAVAILABLE",
          error: "Не удалось установить пароль. Попробуйте позже.",
        },
        503,
      );
    }
  },
);

// POST /api/v1/auth/change-password (authenticated current-password check).
authRoutes.post(
  "/change-password",
  passwordPrivateResponse,
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", changePasswordApiSchema),
  async (c) => {
    try {
      const { currentPassword, newPassword } = c.req.valid("json");
      const userId = c.get("user").id;
      await changePassword(userId, currentPassword, newPassword);
      return c.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const safeMessages = [
        "Пользователь не найден",
        "Сначала установите пароль",
        "Неверный текущий пароль",
      ];
      if (safeMessages.includes(msg)) {
        return c.json({ success: false, error: msg }, 400);
      }
      logger.error(
        "change-password unavailable",
        new Error("CHANGE_PASSWORD_OPERATION_UNAVAILABLE"),
      );
      return c.json(
        {
          success: false,
          code: "PASSWORD_OPERATION_UNAVAILABLE",
          error: "Не удалось сменить пароль. Попробуйте позже.",
        },
        503,
      );
    }
  },
);

// G03 private username endpoints: apply before JWT/Origin/Zod so even
// early authentication failures cannot be cached or leak query Referer.
export const usernamePrivateResponse: MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
};

// GET /api/v1/auth/username-available — live-check доступности логина
authRoutes.get(
  "/username-available",
  usernamePrivateResponse,
  authMiddleware,
  zValidator("query", usernameAvailableQuerySchema),
  async (c) => {
    try {
      const { username } = c.req.valid("query");
      const user = c.get("user");
      const available = await isUsernameAvailable(username, user.id);
      const response: UsernameAvailabilityServiceResponse = {
        success: true,
        data: { available },
      };
      return c.json(response);
    } catch {
      logger.error(
        "username-available unavailable",
        new Error("G03_USERNAME_AVAILABILITY_UNAVAILABLE"),
      );
      return c.json(
        {
          success: false,
          code: "USERNAME_UNAVAILABLE",
          error: "Ошибка проверки логина",
        } satisfies UsernameAvailabilityServiceResponse,
        500,
      );
    }
  },
);

// POST /api/v1/auth/username-change (требует JWT)
authRoutes.post(
  "/username-change",
  usernamePrivateResponse,
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", usernameChangeSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { newUsername } = c.req.valid("json");
      await changeUsername(user.id, newUsername);
      const updated = await getAuthUserById(user.id);
      if (!updated || updated.id !== user.id) {
        // Core may already have committed. Never imply rollback or auto-retry.
        logger.error(
          "username-change readback unresolved",
          new Error("G03_POST_WRITE_READ_UNCONFIRMED"),
        );
        return c.json(
          {
            success: false,
            code: "USERNAME_RESULT_UNCONFIRMED",
            error: "Не удалось подтвердить результат смены логина",
          },
          500,
        );
      }
      logger.info("username-change success", { userId: user.id });
      return c.json({
        success: true,
        data: { user: { id: updated.id, username: updated.username, role: updated.role } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Логин уже занят") {
        // Preserve current 400 until AG4 accepts a 409 SQL collision policy.
        return c.json({ success: false, code: "USERNAME_TAKEN", error: "Логин уже занят" }, 400);
      }
      // Do not expose or log raw SQL/provider exceptions; commit is unknown.
      logger.error("username-change unavailable", new Error("G03_USERNAME_OPERATION_UNAVAILABLE"));
      return c.json(
        {
          success: false,
          code: "USERNAME_RESULT_UNCONFIRMED",
          error: "Не удалось подтвердить результат смены логина",
        },
        503,
      );
    }
  },
);
