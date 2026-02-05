/**
 * User Routes
 * Endpoints для профиля и настроек пользователя
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { prisma } from "@gafus/prisma";
import { getPublicProfile } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";

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
  fullName: z.string().optional(),
  about: z.string().optional(),
  telegram: z.string().optional(),
  instagram: z.string().optional(),
  website: z.string().optional(),
  birthDate: z.string().optional(),
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

    // Подготавливаем данные для обновления
    const updateData: Record<string, unknown> = {};
    const createData: Record<string, unknown> = {
      user: { connect: { id: user.id } },
    };

    const fields = ["fullName", "about", "telegram", "instagram", "website"] as const;
    for (const field of fields) {
      if (data[field] !== undefined) {
        const value = data[field] === "" ? null : data[field];
        updateData[field] = value;
        createData[field] = value;
      }
    }

    if (data.birthDate !== undefined) {
      if (data.birthDate === "") {
        updateData.birthDate = null;
        createData.birthDate = null;
      } else {
        const parsed = new Date(data.birthDate);
        if (isNaN(parsed.getTime())) {
          return c.json({ success: false, error: "Неверная дата" }, 400);
        }
        updateData.birthDate = parsed;
        createData.birthDate = parsed;
      }
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: updateData,
      create: createData as Parameters<typeof prisma.userProfile.create>[0]["data"],
    });

    return c.json({ success: true, data: profile });
  } catch (error) {
    logger.error("Error updating profile", error as Error);
    return c.json({ success: false, error: "Ошибка обновления профиля" }, 500);
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
