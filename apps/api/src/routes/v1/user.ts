/**
 * User Routes
 * Endpoints для профиля и настроек пользователя
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  deleteUserAccount,
  deleteUserAccountBodySchema,
  getPublicProfile,
  getUserProfileForApi,
  requestAccountDeletionCode,
  updateAvatar,
  updateUserProfile,
} from "@gafus/core/services/user";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core/utils/social";
import { createWebLogger } from "@gafus/logger";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-user");
const deleteAccountLogger = createWebLogger("api-user-delete");

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
    const userData = await getUserProfileForApi(user.id);
    if (!userData) {
      return c.json({ success: false, error: "Пользователь не найден" }, 404);
    }
    return c.json({ success: true, data: userData });
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

// POST /api/v1/user/account/deletion-code — письмо с кодом подтверждения удаления
userRoutes.post("/account/deletion-code", async (c) => {
  const user = c.get("user");
  try {
    const result = await requestAccountDeletionCode(user.id);

    if (result.success) {
      return c.json({ success: true }, 200);
    }

    const { error, code } = result;
    if (code === "FORBIDDEN") {
      return c.json({ success: false, error }, 403);
    }
    if (code === "VALIDATION") {
      return c.json({ success: false, error }, 400);
    }
    if (code === "CONFLICT") {
      return c.json({ success: false, error }, 409);
    }
    if (code === "INTERNAL") {
      return c.json({ success: false, error }, 500);
    }
    return c.json({ success: false, error }, 400);
  } catch (error) {
    deleteAccountLogger.error(
      "Ошибка запроса кода удаления",
      error as Error,
      { userId: user.id },
    );
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// POST /api/v1/user/account/delete — необратимое удаление (код из письма)
userRoutes.post(
  "/account/delete",
  zValidator("json", deleteUserAccountBodySchema),
  async (c) => {
    const user = c.get("user");
    try {
      const { code } = c.req.valid("json");
      const result = await deleteUserAccount({
        actorUserId: user.id,
        code,
      });

      if (result.success) {
        return c.json({ success: true }, 200);
      }

      const { error, code: errCode } = result;
      if (errCode === "FORBIDDEN") {
        return c.json({ success: false, error }, 403);
      }
      if (errCode === "VALIDATION") {
        return c.json({ success: false, error }, 400);
      }
      if (errCode === "CONFLICT") {
        return c.json({ success: false, error }, 409);
      }
      if (errCode === "INTERNAL") {
        return c.json({ success: false, error }, 500);
      }
      if (error.startsWith("Неверный или просроченный код")) {
        return c.json({ success: false, error }, 401);
      }
      return c.json({ success: false, error }, 400);
    } catch (error) {
      deleteAccountLogger.error(
        "Ошибка удаления аккаунта",
        error as Error,
        { userId: user.id },
      );
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);
