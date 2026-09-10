/**
 * Auth Routes
 * Endpoints для авторизации: login, register, refresh, logout
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import crypto from "crypto";

import {
  authRegisterBodySchema,
  coreRegisterEmailSchema,
  resolveRegistrationChannelFromBody,
} from "@gafus/core/validation/auth-register";
import { assertCompletedUser, generateAccessToken, generateRefreshToken, verifyRefreshToken } from "@gafus/auth/jwt";
import {
  changePassword,
  changeUsername,
  confirmEmailChangeByToken,
  isUsernameAvailable,
  createRefreshSession,
  exchangeVkCodeAndGetUser,
  exchangeVkCodeForProfile,
  getAuthUserById,
  linkVkToUser,
  REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE,
  registerUserService,
  requestEmailChange,
  resetPassword,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  sendPasswordResetRequestByEmail,
  setPassword,
  setVkPhone,
  validateCredentials,
  validateRefreshToken,
  claimVkRegistrationContextUserInTransaction,
  completeVkRegistration,
  createVkRegistrationContextInTransaction,
  resolveRegistrationPromoCodeInTransaction,
  hashRegistrationOpaqueValue,
} from "@gafus/core/services/auth";
import {
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  getMobileFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";
import { createWebLogger } from "@gafus/logger";
import { prisma, RegistrationChannel, VkRegistrationContextPurpose } from "@gafus/prisma";
import { getClientAppContext } from "../../lib/client-app-context.js";
import { authMiddleware } from "../../middleware/auth.js";

const logger = createWebLogger("api-auth");

const CONSENT_VERSION = process.env.CONSENT_VERSION ?? "v1.4 2026-08-13";

export const authRoutes = new Hono();

// Schemas
const loginSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  password: z.string().min(1, "Пароль обязателен"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
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

const usernameAvailableQuerySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Логин: латиница, цифры, _"),
});

const vkIdSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  device_id: z.string().min(1),
  state: z.string().min(32),
  platform: z.enum(["ios", "android"]).optional(),
  // Selection is validated and stored in the durable context, never attributed
  // until consent completion.
  promoCode: z.string().trim().min(1).max(64).optional(),
});
const vkPhoneSetSchema = z.object({
  phone: z
    .string()
    .min(1, "Номер телефона обязателен")
    .regex(/^\+\d{10,15}$/, "Некорректный формат номера (ожидается E.164, пример: +79001234567)"),
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
      const accessToken = await generateAccessToken(authUser);
      const tokenId = crypto.randomUUID();
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        deviceId: c.req.header("x-device-id"),
        userAgent: c.req.header("user-agent"),
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("User logged in", { userId: user.id, deviceId: c.req.header("x-device-id") });

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

    try {
      const result = await registerUserService(
        name,
        email,
        password,
        resolveRegistrationChannelFromBody(registrationChannel),
        promoCode,
        { tempSessionId, consentPayload, formData: { name, email }, ipAddress, userAgent, defaultVersion: CONSENT_VERSION },
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
      const accessToken = await generateAccessToken(authUser);

      const tokenId = crypto.randomUUID();
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("User registered via API", { userId: user.id });

      return c.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, role: user.role },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Register error", error as Error);
      const message = error instanceof Error ? error.message : "Ошибка регистрации";
      return c.json({ success: false, error: message }, 500);
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
      const promo = await prisma.$transaction((tx) => resolveRegistrationPromoCodeInTransaction(tx, c.req.valid("json").promoCode));
      return c.json({ success: true, data: { code: promo!.normalizedCode } });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "PROMO_INVALID";
      return c.json({ success: false, code, error: "Промокод недействителен или недоступен" }, 400);
    }
  },
);

// POST /api/v1/auth/refresh
authRoutes.post(
  "/refresh",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", refreshSchema),
  async (c) => {
    try {
      const { refreshToken } = c.req.valid("json");

      const payload = await verifyRefreshToken(refreshToken);
      if (!payload) {
        return c.json({ success: false, error: "Недействительный refresh token" }, 401);
      }

      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      const result = await validateRefreshToken(tokenHash);

      if (!result.valid) {
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
      const newAccessToken = await generateAccessToken(authUser);
      const newTokenId = crypto.randomUUID();
      const newRefreshToken = await generateRefreshToken(user.id, newTokenId);
      const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

      await rotateRefreshToken(tokenHash, user.id, newTokenHash, newTokenId, {
        deviceId: c.req.header("x-device-id"),
        userAgent: c.req.header("user-agent"),
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

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
      const { refreshToken } = c.req.valid("json");
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      await revokeRefreshToken(tokenHash);
      return c.json({ success: true });
    } catch (error) {
      logger.error("Logout error", error as Error);
      return c.json({ success: true }); // Не раскрываем ошибки logout
    }
  },
);

// POST /api/v1/auth/check-phone-match — заглушка (не раскрываем привязку логин–телефон)
authRoutes.post(
  "/check-phone-match",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", checkPhoneMatchSchema),
  async (c) => {
    return c.json({ success: true, data: { matches: true } });
  },
);

// POST /api/v1/auth/password-reset-request — письмо со ссылкой на email
authRoutes.post(
  "/password-reset-request",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", passwordResetRequestSchema),
  async (c) => {
    try {
      const { email } = c.req.valid("json");
      await sendPasswordResetRequestByEmail(email);
      return c.json({
        success: true,
        message: "Если этот email зарегистрирован, мы отправили письмо со ссылкой",
      });
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
      await resetPassword(token, password);
      return c.json({ success: true });
    } catch (error) {
      logger.error("Reset password error", error as Error);
      return c.json({ success: false, error: "Не удалось сбросить пароль" }, 400);
    }
  },
);

// POST /api/v1/auth/email-change-request (JWT)
authRoutes.post(
  "/email-change-request",
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", emailChangeRequestSchema),
  async (c) => {
    try {
      const { newEmail } = c.req.valid("json");
      await requestEmailChange(c.get("user").id, newEmail);
      return c.json({ success: true });
    } catch (error) {
      logger.error("email-change-request error", error as Error);
      return c.json(
        { success: false, error: error instanceof Error ? error.message : "Ошибка" },
        400,
      );
    }
  },
);

// POST /api/v1/auth/email-change-confirm — подтверждение по токену из письма
authRoutes.post(
  "/email-change-confirm",
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", emailChangeConfirmSchema),
  async (c) => {
    try {
      const { token } = c.req.valid("json");
      await confirmEmailChangeByToken(token);
      return c.json({ success: true });
    } catch (error) {
      logger.error("email-change-confirm error", error as Error);
      return c.json(
        { success: false, error: error instanceof Error ? error.message : "Ошибка" },
        400,
      );
    }
  },
);

const vkConsentSchema = z.object({
  contextToken: z.string().min(32, "Контекст обязателен").optional(),
  vkConsentToken: z.string().min(32, "Контекст обязателен").optional(), // legacy field name for current clients
  state: z.string().min(32, "Состояние авторизации обязательно"),
  tempSessionId: z.string().uuid().optional(),
  // Kept for clients that display the field on consent. Attribution has
  // already happened in the account-creation transaction, if applicable.
  promoCode: z.string().trim().min(1).max(64).optional(),
  consentPayload: z.object({
    acceptPersonalData: z.literal(true, {
      errorMap: () => ({ message: "Необходимо принять согласие на обработку данных" }),
    }),
    acceptPrivacyPolicy: z.literal(true, {
      errorMap: () => ({ message: "Необходимо принять политику конфиденциальности" }),
    }),
    acceptDataDistribution: z.literal(true, {
      errorMap: () => ({ message: "Необходимо принять согласие на размещение данных" }),
    }),
  }),
});

// Context inspection intentionally returns no account data. It lets a mobile
// consent screen restore the server-saved promo after a restart.
authRoutes.get("/vk-consent/:contextToken", async (c) => {
  const state = c.req.query("state");
  if (!state) return c.json({ success: false, code: "CONTEXT_INVALID", error: "Контекст VK не найден. Повторите вход." }, 400);
  const context = await prisma.vkRegistrationContext.findFirst({
    where: {
      contextTokenHash: hashRegistrationOpaqueValue(c.req.param("contextToken")),
      stateHash: hashRegistrationOpaqueValue(state),
      purpose: VkRegistrationContextPurpose.REGISTER,
      expiresAt: { gt: new Date() },
    },
    select: { selectedPromoCodeValue: true, completedAt: true },
  });
  if (!context) return c.json({ success: false, code: "CONTEXT_EXPIRED", error: "Время подтверждения истекло. Повторите вход через VK." }, 400);
  return c.json({ success: true, data: { savedPromoCode: context.selectedPromoCodeValue, completed: Boolean(context.completedAt) } });
});

// POST /api/v1/auth/vk — вход через VK ID (mobile, PKCE)
authRoutes.post(
  "/vk",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", vkIdSchema),
  async (c) => {
    try {
      const clientContext = getClientAppContext(c);
      if (
        clientContext.platform === "ios" &&
        !(await getMobileFeatureFlagEnabled(
          APP_FEATURE_MOBILE_VK_LOGIN_IOS,
          clientContext,
          false,
          false,
        ))
      ) {
        return c.json(
          {
            success: false,
            error: "Вход через VK недоступен в этой версии",
            code: "FEATURE_DISABLED",
          },
          403,
        );
      }
      const { code, code_verifier, device_id, state, platform, promoCode } = c.req.valid("json");
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "";

      const clientId =
        platform === "ios"
          ? (process.env.VK_CLIENT_ID_IOS ?? process.env.VK_CLIENT_ID ?? "")
          : platform === "android"
            ? (process.env.VK_CLIENT_ID_ANDROID ?? process.env.VK_CLIENT_ID ?? "")
            : (process.env.VK_CLIENT_ID ?? "");

      const vkRegistrationChannel =
        platform === "ios"
          ? RegistrationChannel.IOS
          : platform === "android"
            ? RegistrationChannel.ANDROID
            : RegistrationChannel.UNKNOWN;

      // Create and validate the durable consent context before consuming the
      // single-use VK OAuth code.  Previously an invalid promo or a database
      // error after findOrCreateVkUser() could leave a new user permanently
      // registrationPending without a context token with which to finish.
      const contextToken = crypto.randomBytes(32).toString("base64url");
      await prisma.$transaction(async (tx) => {
        const selected = promoCode
          ? await resolveRegistrationPromoCodeInTransaction(tx, promoCode)
          : null;
        await createVkRegistrationContextInTransaction(tx, {
          contextToken,
          state,
          codeVerifier: code_verifier,
          purpose: VkRegistrationContextPurpose.REGISTER,
          selectedPromoCodeId: selected?.id,
          selectedPromoCodeValue: selected?.normalizedCode,
        });
      });

      const result = await exchangeVkCodeAndGetUser({
        code,
        codeVerifier: code_verifier,
        deviceId: device_id,
        state,
        redirectUri: `vk${clientId}://vk.ru/blank.html`,
        clientId,
        registrationChannel: vkRegistrationChannel,
        promoCode,
      });

      const { user, needsPhone, isNewUser } = result;

      if (result.requiresConsent) {
        await prisma.$transaction(async (tx) => {
          await claimVkRegistrationContextUserInTransaction(tx, { contextToken, state, userId: user.id, purpose: VkRegistrationContextPurpose.REGISTER });
        });
        logger.info("VK ID new user, needs consent", { userId: user.id });
        return c.json({
          success: true,
          data: {
            needsConsent: true,
            vkConsentToken: contextToken,
            contextToken,
            savedPromoCode: promoCode?.trim().toUpperCase() ?? null,
            user: { id: user.id, username: user.username, role: user.role },
          },
        });
      }

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER",
      };
      await assertCompletedUser(user.id);
      const accessToken = await generateAccessToken(authUser);
      const tokenId = crypto.randomUUID();
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        ipAddress: ip,
        userAgent: c.req.header("user-agent"),
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("VK ID auth success", { userId: user.id });

      return c.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, role: user.role },
          accessToken,
          refreshToken,
          needsPhone,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("VK token exchange failed") || msg.includes("VK profile fetch failed")) {
        logger.warn("VK ID auth failed", { error: msg });
        return c.json({ success: false, error: "Не удалось получить токен VK ID" }, 400);
      }
      logger.error("VK ID auth error", error as Error);
      return c.json({ success: false, error: "Ошибка авторизации VK ID" }, 500);
    }
  },
);

// POST /api/v1/auth/vk-consent — согласия для новых VK-пользователей (mobile)
authRoutes.post(
  "/vk-consent",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", vkConsentSchema),
  async (c) => {
    try {
      const { contextToken: directContextToken, vkConsentToken, state, consentPayload, promoCode, tempSessionId } = c.req.valid("json");
      const contextToken = directContextToken ?? vkConsentToken;
      if (!contextToken) return c.json({ success: false, code: "CONTEXT_INVALID", error: "Контекст VK не найден. Повторите вход." }, 400);
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "";
      const userAgent = c.req.header("user-agent");
      const pendingContext = await prisma.vkRegistrationContext.findFirst({
        where: { contextTokenHash: hashRegistrationOpaqueValue(contextToken), stateHash: hashRegistrationOpaqueValue(state) },
        select: { user: { select: { username: true } } },
      });
      if (!pendingContext?.user) return c.json({ success: false, code: "CONTEXT_EXPIRED", error: "Время подтверждения истекло. Повторите вход через VK." }, 400);

      const completion = await completeVkRegistration({
        contextToken, state, promoCode,
        consent: { tempSessionId: tempSessionId ?? crypto.randomUUID(), consentPayload, formData: { name: pendingContext.user.username }, ipAddress: ip, userAgent: userAgent ?? undefined, defaultVersion: CONSENT_VERSION },
        transport: "MOBILE",
      });
      const user = await getAuthUserById(completion.user.id);
      if (!user) return c.json({ success: false, error: "Пользователь не найден" }, 400);

      const authUser = {
        id: user.id,
        username: user.username,
          role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER",
      };
      await assertCompletedUser(user.id);
      const accessToken = await generateAccessToken(authUser);
      const tokenId = crypto.randomUUID();
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await createRefreshSession(user.id, tokenId, tokenHash, {
        ipAddress: ip,
        userAgent: userAgent ?? undefined,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      });

      logger.info("VK consent completed", { userId: user.id });

      return c.json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, role: user.role },
          accessToken,
          refreshToken,
          needsPhone: user.phone?.startsWith("vk_") ?? false,
        },
      });
    } catch (error) {
      logger.error("VK consent error", error as Error);
      return c.json(
        { success: false, error: "Не удалось сохранить согласия. Попробуйте снова." },
        500,
      );
    }
  },
);

// POST /api/v1/auth/vk-phone-set (требует JWT)
authRoutes.post(
  "/vk-phone-set",
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", vkPhoneSetSchema),
  async (c) => {
    try {
      const { phone } = c.req.valid("json");
      const userId = c.get("user").id;
      await setVkPhone(userId, phone);
      return c.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const safeMessages = [
        "Пользователь не найден",
        "Смена номера недоступна через этот метод",
        "Неверный формат номера телефона",
      ];
      return c.json(
        { success: false, error: safeMessages.includes(msg) ? msg : "Не удалось установить номер" },
        400,
      );
    }
  },
);

// POST /api/v1/auth/vk-link — привязка VK аккаунта (mobile, PKCE, требует JWT)
authRoutes.post(
  "/vk-link",
  authMiddleware,
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", vkIdSchema),
  async (c) => {
    try {
      const clientContext = getClientAppContext(c);
      if (
        clientContext.platform === "ios" &&
        !(await getMobileFeatureFlagEnabled(
          APP_FEATURE_MOBILE_VK_LOGIN_IOS,
          clientContext,
          false,
          false,
        ))
      ) {
        return c.json(
          {
            success: false,
            error: "Подключение VK недоступно в этой версии",
            code: "FEATURE_DISABLED",
          },
          403,
        );
      }
      const { code, code_verifier, device_id, state, platform } = c.req.valid("json");
      const user = c.get("user");

      const clientId =
        platform === "ios"
          ? (process.env.VK_CLIENT_ID_IOS ?? process.env.VK_CLIENT_ID ?? "")
          : platform === "android"
            ? (process.env.VK_CLIENT_ID_ANDROID ?? process.env.VK_CLIENT_ID ?? "")
            : (process.env.VK_CLIENT_ID ?? "");

      const vkProfile = await exchangeVkCodeForProfile({
        code,
        codeVerifier: code_verifier,
        deviceId: device_id,
        state,
        redirectUri: `vk${clientId}://vk.ru/blank.html`,
        clientId,
      });
      const result = await linkVkToUser(user.id, vkProfile);
      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      logger.info("VK link success via API", { userId: user.id });
      return c.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("VK token exchange failed") || msg.includes("VK profile fetch failed")) {
        logger.warn("VK link failed", { error: msg });
        return c.json({ success: false, error: "Не удалось получить токен VK ID" }, 400);
      }
      logger.error("VK link error", error as Error);
      return c.json({ success: false, error: "Ошибка привязки VK" }, 500);
    }
  },
);

// POST /api/v1/auth/set-password (требует JWT)
authRoutes.post(
  "/set-password",
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
      return c.json(
        {
          success: false,
          error: safeMessages.includes(msg) ? msg : "Не удалось установить пароль",
        },
        400,
      );
    }
  },
);

// POST /api/v1/auth/change-password (требует JWT)
authRoutes.post(
  "/change-password",
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
      return c.json(
        { success: false, error: error instanceof Error ? error.message : "Ошибка" },
        400,
      );
    }
  },
);

// GET /api/v1/auth/username-available — live-check доступности логина
authRoutes.get(
  "/username-available",
  authMiddleware,
  zValidator("query", usernameAvailableQuerySchema),
  async (c) => {
    try {
      const { username } = c.req.valid("query");
      const user = c.get("user");
      const available = await isUsernameAvailable(username, user.id);
      return c.json({ success: true, data: { available } });
    } catch (error) {
      logger.error("username-available error", error as Error);
      return c.json({ success: false, error: "Ошибка проверки логина" }, 500);
    }
  },
);

// POST /api/v1/auth/username-change (требует JWT)
authRoutes.post(
  "/username-change",
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", usernameChangeSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { newUsername } = c.req.valid("json");
      await changeUsername(user.id, newUsername);
      const updated = await getAuthUserById(user.id);
      if (!updated) {
        return c.json({ success: false, error: "Ошибка сервера" }, 500);
      }
      logger.info("username-change success", { userId: user.id, newUsername: updated.username });
      return c.json({
        success: true,
        data: { user: { id: updated.id, username: updated.username, role: updated.role } },
      });
    } catch (error) {
      logger.error("username-change error", error as Error);
      const message = error instanceof Error ? error.message : "Не удалось сменить логин";
      return c.json({ success: false, error: message }, 400);
    }
  },
);
