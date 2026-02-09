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
import { sendPasswordResetRequest } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-auth");

export const authRoutes = new Hono();

// Schemas
const loginSchema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  password: z.string().min(1, "Пароль обязателен"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Имя обязательно"), // Используется как username
  phone: z.string().min(1, "Номер телефона обязателен"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .max(100, "Пароль не более 100 символов")
    .regex(/[A-Z]/, "Минимум одна заглавная буква")
    .regex(/[a-z]/, "Минимум одна строчная буква")
    .regex(/[0-9]/, "Минимум одна цифра"),
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

// POST /api/v1/auth/register
authRoutes.post(
  "/register",
  bodyLimit({ maxSize: 10 * 1024 }),
  zValidator("json", registerSchema),
  async (c) => {
    try {
      const { name, phone, password } = c.req.valid("json");

      // name передаётся как username в registerUser(username, phone, password)
      const result = await registerUser(name, phone, password);

      if ("error" in result) {
        return c.json(
          {
            success: false,
            error:
              "Пользователь с такими данными уже существует. Проверьте данные или войдите в существующий аккаунт.",
          },
          409,
        );
      }

      // Автоматически логиним после регистрации
      const user = await prisma.user.findUnique({
        where: { username: name.toLowerCase().trim() },
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
          userAgent: c.req.header("user-agent"),
          ipAddress: c.req.header("x-forwarded-for")?.split(",")[0],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      logger.info("User registered", { userId: user.id });

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
      return c.json({ success: false, error: message }, 400);
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
