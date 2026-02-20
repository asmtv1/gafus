/**
 * Auth Routes
 * Endpoints для авторизации: login, register, refresh, logout
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "@gafus/prisma";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "@gafus/auth/jwt";
import { registerUser } from "@gafus/auth";
import {
  changeUsername,
  confirmPhoneChange,
  requestPhoneChange,
  sendPasswordResetRequest,
  serverCheckUserConfirmed,
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

// POST /api/v1/auth/login
authRoutes.post(
  "/login",
  bodyLimit({ maxSize: 10 * 1024 }), // 10KB
  zValidator("json", loginSchema),
  async (c) => {
    try {
      const { username, password } = c.req.valid("json");
      const normalizedUsername = username.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { username: normalizedUsername },
        select: { id: true, username: true, password: true, role: true },
      });

      if (!user) {
        logger.warn("Login attempt for non-existent user", {
          username: normalizedUsername,
        });
        return c.json({ success: false, error: "Неверные учётные данные" }, 401);
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        logger.warn("Invalid password attempt", {
          username: normalizedUsername,
        });
        return c.json({ success: false, error: "Неверные учётные данные" }, 401);
      }

      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };

      // Генерируем токены
      const accessToken = await generateAccessToken(authUser);

      // Создаём refresh token в БД
      const tokenId = crypto.randomUUID();
      const refreshToken = await generateRefreshToken(user.id, tokenId);
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await prisma.refreshToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash,
          deviceId: c.req.header("x-device-id"),
          userAgent: c.req.header("user-agent"),
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней
        },
      });

      logger.info("User logged in", {
        userId: user.id,
        deviceId: c.req.header("x-device-id"),
      });

      return c.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
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
// TODO: rate limiting — добавить Hono middleware или IP-throttle отдельной задачей
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

      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        select: { id: true, username: true, role: true },
      });

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

      await prisma.refreshToken.create({
        data: {
          id: tokenId,
          userId: user.id,
          tokenHash,
          userAgent,
          ipAddress,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
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

      // Проверяем токен в БД
      const storedToken = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, username: true, role: true } } },
      });

      // TOKEN REUSE DETECTION: Если токен уже был отозван — это признак кражи!
      if (storedToken?.revokedAt) {
        logger.warn("Refresh token reuse detected - possible token theft!", {
          userId: storedToken.userId,
          tokenId: storedToken.id,
          ip: c.req.header("x-forwarded-for")?.split(",")[0],
        });

        // Отзываем ВСЕ refresh токены пользователя (принудительный logout везде)
        await prisma.refreshToken.updateMany({
          where: { userId: storedToken.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        return c.json(
          {
            success: false,
            error: "Сессия скомпрометирована. Войдите заново.",
            code: "TOKEN_REUSE_DETECTED",
          },
          401,
        );
      }

      if (!storedToken || storedToken.expiresAt < new Date()) {
        return c.json({ success: false, error: "Токен отозван или истёк" }, 401);
      }

      // Ротация токена (отзываем старый, создаём новый)
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      const user = storedToken.user;
      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role as "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM",
      };

      const newAccessToken = await generateAccessToken(authUser);
      const newTokenId = crypto.randomUUID();
      const newRefreshToken = await generateRefreshToken(user.id, newTokenId);
      const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

      await prisma.refreshToken.create({
        data: {
          id: newTokenId,
          userId: user.id,
          tokenHash: newTokenHash,
          deviceId: c.req.header("x-device-id"),
          userAgent: c.req.header("user-agent"),
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
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

      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });

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
      return c.json({ success: false, error: "Ошибка отправки запроса" }, 500);
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
      const updated = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, username: true, role: true },
      });
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
