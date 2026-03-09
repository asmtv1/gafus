/**
 * Auth Routes
 * Endpoints для авторизации: login, register, refresh, logout
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import crypto from "crypto";

import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "@gafus/auth/jwt";
import { registerUser } from "@gafus/auth";
import { storeVkIdOneTimeUser, consumeVkIdOneTimeUser } from "@gafus/auth";
import {
  changePassword,
  changeUsername,
  confirmPhoneChange,
  isUsernameAvailable,
  createRefreshSession,
  exchangeVkCodeAndGetUser,
  exchangeVkCodeForProfile,
  getAuthUserById,
  linkVkToUser,
  requestPhoneChange,
  resetPasswordByCode,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  sendPasswordResetRequest,
  serverCheckUserConfirmed,
  setPassword,
  setVkPhone,
  validateCredentials,
  validateRefreshToken,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "@gafus/core/services/consent";
import { authMiddleware } from "../../middleware/auth.js";

const logger = createWebLogger("api-auth");

const CONSENT_VERSION = process.env.CONSENT_VERSION ?? "v1.0 2026-02-13";

export const authRoutes = new Hono();

// Schemas
const loginSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  password: z.string().min(1, "Пароль обязателен"),
});

const registerSchema = z.object({
  name: z.string().trim().min(3, "Минимум 3 символа").max(50, "Максимум 50 символов")
    .regex(/^[a-zA-Z0-9_]+$/, "Только латиница, цифры и _"),
  phone: z.string().min(1, "Номер телефона обязателен"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .max(100, "Пароль не более 100 символов")
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
  tempSessionId: z.string().uuid("tempSessionId должен быть UUID"),
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

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const checkPhoneMatchSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  phone: z.string().min(1, "Номер телефона обязателен"),
});

const passwordResetRequestSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  phone: z.string().min(1, "Номер телефона обязателен"),
});

const resetPasswordSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "Код — 6 цифр")
    .regex(/^\d{6}$/, "Код — 6 цифр"),
  password: z
    .string()
    .min(8, "Минимум 8 символов")
    .max(100, "Максимум 100 символов")
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
});

const checkConfirmedSchema = z.object({
  phone: z.string().min(1, "Номер телефона обязателен"),
});

const phoneChangeConfirmSchema = z.object({
  code: z.string().trim().length(6).regex(/^\d{6}$/, "Код — 6 цифр"),
  newPhone: z.string().trim().min(1, "Номер телефона обязателен"),
});

const usernameChangeSchema = z.object({
  newUsername: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Логин: латиница, цифры, _"),
});

const usernameAvailableQuerySchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Логин: латиница, цифры, _"),
});

const vkIdSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  device_id: z.string().min(1),
  state: z.string().min(32),
  platform: z.enum(["ios", "android"]).optional(),
});
const vkPhoneSetSchema = z.object({
  phone: z
    .string()
    .min(1, "Номер телефона обязателен")
    .regex(/^\+\d{10,15}$/, "Некорректный формат номера (ожидается E.164, пример: +79001234567)"),
});
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
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };

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

// POST /api/v1/auth/check-confirmed
authRoutes.post(
  "/check-confirmed",
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", checkConfirmedSchema),
  async (c) => {
    try {
      const { phone } = c.req.valid("json");
      const confirmed = await serverCheckUserConfirmed(phone);
      return c.json({ success: true, data: { confirmed } });
    } catch (error) {
      logger.error("check-confirmed error", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
    }
  },
);

// POST /api/v1/auth/register
authRoutes.post(
  "/register",
  bodyLimit({ maxSize: 10 * 1024 }),
  zValidator("json", registerSchema),
  async (c) => {
    const { name, phone, password, tempSessionId, consentPayload } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0];
    const userAgent = c.req.header("user-agent");

    let consentCreated = false;
    try {
      await createConsentLogs({
        tempSessionId,
        consentPayload,
        formData: { name: name.toLowerCase().trim(), phone },
        ipAddress,
        userAgent,
        defaultVersion: CONSENT_VERSION,
      });
      consentCreated = true;

      const result = await registerUser(name, phone, password);

      if ("error" in result) {
        await markConsentLogsFailed(tempSessionId);
        return c.json(
          {
            success: false,
            error:
              "Пользователь с такими данными уже существует. Проверьте данные или войдите в существующий аккаунт.",
          },
          409,
        );
      }

      await linkConsentLogsToUser(tempSessionId, result.userId);

      const user = await getAuthUserById(result.userId);
      if (!user) {
        return c.json({ success: false, error: "Ошибка регистрации" }, 500);
      }

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };
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
      if (consentCreated) {
        await markConsentLogsFailed(tempSessionId).catch(() => undefined);
      }
      logger.error("Register error", error as Error);
      const message = error instanceof Error ? error.message : "Ошибка регистрации";
      return c.json({ success: false, error: message }, 500);
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
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };

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

// POST /api/v1/auth/password-reset-request
authRoutes.post(
  "/password-reset-request",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", passwordResetRequestSchema),
  async (c) => {
    try {
      const { username, phone } = c.req.valid("json");

      await sendPasswordResetRequest(username, phone);

      return c.json({ success: true });
    } catch (error) {
      logger.error("Password reset request error", error as Error);
      const message =
        error instanceof Error ? error.message : "Ошибка отправки запроса";
      const status =
        message.includes("не найден") ||
        message.includes("не совпадает") ||
        message.includes("не привязан") ||
        message.includes("Попробуйте через минуту")
          ? 400
          : 500;
      return c.json({ success: false, error: message }, status);
    }
  },
);

// POST /api/v1/auth/reset-password — сброс пароля по 6-значному коду из Telegram
authRoutes.post(
  "/reset-password",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", resetPasswordSchema),
  async (c) => {
    try {
      const { code, password } = c.req.valid("json");
      await resetPasswordByCode(code, password);
      return c.json({ success: true });
    } catch (error) {
      logger.error("Reset password error", error as Error);
      // Нейтральное сообщение — не раскрываем "неверный код" vs "истёк"
      return c.json({ success: false, error: "Не удалось сбросить пароль" }, 400);
    }
  },
);

// POST /api/v1/auth/phone-change-request (требует JWT)
authRoutes.post(
  "/phone-change-request",
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  async (c) => {
    try {
      const user = c.get("user");
      await requestPhoneChange(user.id);
      logger.info("phone-change-request success", { userId: user.id });
      return c.json({ success: true });
    } catch (error) {
      logger.error("phone-change-request error", error as Error);
      const message = error instanceof Error ? error.message : "Ошибка запроса кода";
      return c.json({ success: false, error: message }, 400);
    }
  },
);

// POST /api/v1/auth/phone-change-confirm (требует JWT)
authRoutes.post(
  "/phone-change-confirm",
  authMiddleware,
  bodyLimit({ maxSize: 1024 }),
  zValidator("json", phoneChangeConfirmSchema),
  async (c) => {
    try {
      const { code, newPhone } = c.req.valid("json");
      await confirmPhoneChange(code, newPhone);
      const user = c.get("user");
      logger.info("phone-change-confirm success", { userId: user.id });
      return c.json({ success: true });
    } catch (error) {
      logger.error("phone-change-confirm error", error as Error);
      const message = error instanceof Error ? error.message : "Не удалось сменить номер";
      return c.json({ success: false, error: message }, 400);
    }
  },
);

const vkConsentSchema = z.object({
  vkConsentToken: z.string().min(1, "Токен обязателен"),
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

// POST /api/v1/auth/vk — вход через VK ID (mobile, PKCE)
authRoutes.post(
  "/vk",
  bodyLimit({ maxSize: 5 * 1024 }),
  zValidator("json", vkIdSchema),
  async (c) => {
    try {
      const { code, code_verifier, device_id, state, platform } = c.req.valid("json");
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "";

      const clientId =
        platform === "ios"
          ? (process.env.VK_CLIENT_ID_IOS ?? process.env.VK_CLIENT_ID ?? "")
          : platform === "android"
            ? (process.env.VK_CLIENT_ID_ANDROID ?? process.env.VK_CLIENT_ID ?? "")
            : (process.env.VK_CLIENT_ID ?? "");

      const result = await exchangeVkCodeAndGetUser({
        code,
        codeVerifier: code_verifier,
        deviceId: device_id,
        state,
        redirectUri: `vk${clientId}://vk.ru/blank.html`,
        clientId,
      });

      const { user, needsPhone, isNewUser } = result;

      if (isNewUser) {
        const vkConsentToken = await storeVkIdOneTimeUser(crypto.randomUUID(), {
          userId: user.id,
          username: user.username,
          role: user.role,
        });
        logger.info("VK ID new user, needs consent", { userId: user.id });
        return c.json({
          success: true,
          data: {
            needsConsent: true,
            vkConsentToken,
            user: { id: user.id, username: user.username, role: user.role },
          },
        });
      }

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };
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
      const { vkConsentToken, consentPayload } = c.req.valid("json");
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "";
      const userAgent = c.req.header("user-agent");

      const vkUser = await consumeVkIdOneTimeUser(vkConsentToken);
      if (!vkUser) {
        return c.json(
          { success: false, error: "Ссылка устарела. Повторите вход через VK." },
          400,
        );
      }

      const user = await getAuthUserById(vkUser.userId);
      if (!user) {
        return c.json({ success: false, error: "Пользователь не найден" }, 400);
      }

      const tempSessionId = crypto.randomUUID();
      await createConsentLogs({
        tempSessionId,
        consentPayload,
        formData: { name: vkUser.username, phone: user.phone ?? "" },
        ipAddress: ip,
        userAgent: userAgent ?? undefined,
        defaultVersion: CONSENT_VERSION,
      });
      await linkConsentLogsToUser(tempSessionId, vkUser.userId);

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };
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
          needsPhone: user.phone.startsWith("vk_"),
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
        { success: false, error: safeMessages.includes(msg) ? msg : "Не удалось установить пароль" },
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
