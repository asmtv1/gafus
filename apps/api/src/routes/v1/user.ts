/**
 * User Routes
 * Endpoints для профиля и настроек пользователя
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { prisma } from "@gafus/prisma";
import { getPublicProfile, updateAvatar, updateUserProfile } from "@gafus/core/services/user";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core/utils/social";
import { createWebLogger } from "@gafus/logger";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-user");

export const userRoutes = new Hono();

// GET /api/v1/user/profile/public?username= — публичный профиль (без auth)
const publicProfileQuerySchema = z.object({
  username: z.string().min(1, "username обязателен"),
});

userRoutes.get("/profile/public", async (c) => {
  try {
    const query = c.req.query("username");
    const parsed = publicProfileQuerySchema.safeParse({ username: query });
    if (!parsed.success) {
      return c.json({ success: false, error: "Требуется username" }, 400);
    }
    const { username } = parsed.data;
    const profile = await getPublicProfile(username);
    if (!profile) {
      return c.json({ success: false, error: "Профиль не найден" }, 404);
    }
    return c.json(
      { success: true, data: profile },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    logger.error("Error in public profile API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// Schemas
const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  about: z.string().trim().max(2000).optional(),
  telegram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeTelegramInput(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["telegram"],
            message: error instanceof Error ? error.message : "Некорректный Telegram username",
          },
        ]);
      }
    }),
  instagram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeInstagramInput(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["instagram"],
            message: error instanceof Error ? error.message : "Некорректный Instagram username",
          },
        ]);
      }
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val) => {
      if (!val) return "";
      try {
        return normalizeWebsiteUrl(val);
      } catch (error) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["website"],
            message: error instanceof Error ? error.message : "Некорректный URL",
          },
        ]);
      }
    }),
  birthDate: z.string().trim().max(100).optional(),
});

// GET /api/v1/user/profile
userRoutes.get("/profile", async (c) => {
  try {
    const user = c.get("user");

    // Получаем user с profile
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        phone: true,
        role: true,
        profile: {
          select: {
            fullName: true,
            about: true,
            telegram: true,
            instagram: true,
            website: true,
            birthDate: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!userData) {
      return c.json({ success: false, error: "Пользователь не найден" }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: userData.id,
        username: userData.username,
        phone: userData.phone,
        role: userData.role,
        profile: userData.profile,
      },
    });
  } catch (error) {
    logger.error("Error getting profile", error as Error);
    return c.json({ success: false, error: "Ошибка получения профиля" }, 500);
  }
});

// PUT /api/v1/user/profile
userRoutes.put("/profile", zValidator("json", updateProfileSchema), async (c) => {
  try {
    const user = c.get("user");
    const data = c.req.valid("json");
    const profile = await updateUserProfile(user.id, data);
    return c.json({ success: true, data: profile });
  } catch (error) {
    logger.error("Error updating profile", error as Error);
    return c.json({ success: false, error: "Ошибка обновления профиля" }, 500);
  }
});

// POST /api/v1/user/avatar — загрузка аватара (multipart/form-data, поле "file")
userRoutes.post("/avatar", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string") {
      return c.json({ success: false, error: "Файл не найден" }, 400);
    }

    if (!ALLOWED_AVATAR_TYPES.includes((file as File).type)) {
      return c.json(
        {
          success: false,
          error: "Неподдерживаемый тип файла. Разрешены: JPEG, PNG, WebP, GIF",
        },
        400,
      );
    }

    if ((file as File).size > MAX_AVATAR_SIZE) {
      return c.json(
        { success: false, error: "Файл слишком большой. Максимум 5 МБ" },
        400,
      );
    }

    const avatarUrl = await updateAvatar(user.id, file as File);
    return c.json({ success: true, data: { avatarUrl } });
  } catch (error) {
    logger.error("Error uploading avatar", error as Error);
    return c.json(
      { success: false, error: "Ошибка загрузки аватара" },
      500,
    );
  }
});

// GET /api/v1/user/preferences (заглушка, можно расширить)
userRoutes.get("/preferences", async (c) => {
  try {
    const user = c.get("user");

    // Пока возвращаем дефолтные настройки
    // В будущем можно хранить в отдельной таблице UserPreferences
    return c.json({
      success: true,
      data: {
        notifications: true,
        theme: "system",
        language: "ru",
      },
    });
  } catch (error) {
    logger.error("Error getting preferences", error as Error);
    return c.json({ success: false, error: "Ошибка получения настроек" }, 500);
  }
});

// PUT /api/v1/user/preferences (заглушка)
userRoutes.put("/preferences", async (c) => {
  try {
    // Пока просто возвращаем успех
    // В будущем можно сохранять в UserPreferences таблицу
    return c.json({
      success: true,
      data: {
        notifications: true,
        theme: "system",
        language: "ru",
      },
    });
  } catch (error) {
    logger.error("Error updating preferences", error as Error);
    return c.json({ success: false, error: "Ошибка обновления настроек" }, 500);
  }
});
