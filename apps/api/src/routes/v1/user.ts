/**
 * User Routes
 * Endpoints для профиля и настроек пользователя
 */
import { Hono } from "hono";
import { z } from "zod";
import { isValidBirthDateEditWire } from "./petCreateBirthDate";
import { zValidator } from "@hono/zod-validator";
import { profileEditValidationError } from "./g1-field-validation";

import {
  deleteUserAccount,
  deleteUserAccountBodySchema,
  requestAccountDeletionCode,
  readAccountDeletionPreflight,
  updateAvatar,
} from "@gafus/core/services/user";
import {
  readProfileApplication,
  updateProfileApplication,
} from "../../modules/user/composition/profile";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core/utils/social";
import { getTrainingReminderPushSubscriptions } from "@gafus/core/services/reminders";
import { onboardingTourApplication } from "../../modules/user/composition/onboarding-tour.js";
import { readPublicProfileApplication } from "../../modules/user/composition/read-public-profile.js";
import { createWebLogger } from "@gafus/logger";
import type { PublicProfile } from "@gafus/types";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const logger = createWebLogger("api-user");
const deleteAccountLogger = createWebLogger("api-user-delete");

export const userRoutes = new Hono();

// Only the private /profile endpoint gets this header; the anonymous
// /profile/public endpoint retains its independent response semantics.
userRoutes.use("/profile", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

// The anonymous response is an API-boundary whitelist, independently of the
// Core/Prisma projection. Never serialize whole DB or third-party DTO objects.
function publicProfileResponse(profile: PublicProfile): PublicProfile {
  return {
    username: profile.username,
    role: profile.role,
    ...(profile.chatRole === undefined ? {} : { chatRole: profile.chatRole }),
    profile: profile.profile
      ? {
          fullName: profile.profile.fullName,
          city: profile.profile.city,
          birthDate: profile.profile.birthDate,
          about: profile.profile.about,
          telegram: profile.profile.telegram,
          instagram: profile.profile.instagram,
          website: profile.profile.website,
          avatarUrl: profile.profile.avatarUrl,
        }
      : null,
    diplomas: (profile.diplomas ?? []).map((diploma) => ({
      id: diploma.id,
      title: diploma.title,
      issuedBy: diploma.issuedBy,
      issuedAt: diploma.issuedAt,
      ...(diploma.url ? { url: diploma.url } : {}),
    })),
    pets: (profile.pets ?? []).map((pet) => ({
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed,
      birthDate: pet.birthDate,
      photoUrl: pet.photoUrl,
    })),
    ...(profile.courses === undefined
      ? {}
      : {
          courses: profile.courses.map((course) => ({
            id: course.id,
            name: course.name,
            type: course.type,
            logoImg: course.logoImg,
            shortDesc: course.shortDesc,
            duration: course.duration,
            isPrivate: course.isPrivate,
            isPaid: course.isPaid,
            avgRating: course.avgRating,
            updatedAt: course.updatedAt,
            trainingLevel: course.trainingLevel,
          })),
        }),
  };
}

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
    const profile = await readPublicProfileApplication.execute(username);
    if (!profile) {
      return c.json({ success: false, error: "Профиль не найден" }, 404);
    }
    return c.json(
      { success: true, data: publicProfileResponse(profile) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    logger.error("Error in public profile API", new Error("PUBLIC_PROFILE_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// Schemas
const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(100).optional(),
  about: z.string().trim().max(2000).optional(),
  telegram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      if (!val) return "";
      try {
        return normalizeTelegramInput(val);
      } catch {
        // Zod needs structured issues; throwing inside transform caused 500.
        ctx.addIssue({ code: "custom", message: "Некорректное поле telegram" });
        return z.NEVER;
      }
    }),
  instagram: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      if (!val) return "";
      try {
        return normalizeInstagramInput(val);
      } catch {
        // Zod needs structured issues; throwing inside transform caused 500.
        ctx.addIssue({ code: "custom", message: "Некорректное поле instagram" });
        return z.NEVER;
      }
    }),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      if (!val) return "";
      try {
        return normalizeWebsiteUrl(val);
      } catch {
        // Zod needs structured issues; throwing inside transform caused 500.
        ctx.addIssue({ code: "custom", message: "Некорректное поле website" });
        return z.NEVER;
      }
    }),
  // Empty string still clears; malformed date is a structured 400, not Core 500.
  birthDate: z
    .string()
    .trim()
    .max(100)
    .refine((v) => !v || isValidBirthDateEditWire(v), { message: "Некорректная дата рождения" })
    .optional(),
});

// GET /api/v1/user/profile
userRoutes.get("/profile", async (c) => {
  try {
    const user = c.get("user");
    const result = await readProfileApplication.execute({
      actorUserId: user.id,
    });
    if (result.kind === "not_found") {
      return c.json({ success: false, error: "Пользователь не найден" }, 404);
    }
    return c.json({ success: true, data: result.profile }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch {
    logger.error("Error getting profile", new Error("USER_PROFILE_READ_FAILED"));
    return c.json({ success: false, error: "Ошибка получения профиля" }, 500);
  }
});

// GET /api/v1/user/push-subscription-status — private read-only account state.
// This is an account-wide boolean; the caller must check its own browser
// PushManager separately. Never return endpoints, keys or other user IDs.
userRoutes.get("/push-subscription-status", async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    // Core returns only the requester's rows. Never include their endpoints,
    // subscription secrets or provider identifiers in the HTTP projection.
    const active = (await getTrainingReminderPushSubscriptions(c.get("user").id)).length > 0;
    return c.json({ success: true, data: { active } }, 200);
  } catch {
    logger.error("Push subscription status read failed", new Error("PUSH_STATUS_READ_FAILED"));
    return c.json({ success: false, code: "PUSH_STATUS_UNAVAILABLE",
      error: "Не удалось проверить подписки" }, 503);
  }
});

// GET /api/v1/user/onboarding-tour
userRoutes.get("/onboarding-tour", async (c) => {
  try {
    const user = c.get("user");
    const status = await onboardingTourApplication.getStatus(user.id);
    return c.json({ success: true, data: status });
  } catch {
    logger.error("Error getting onboarding tour status", new Error("USER_TOUR_READ_FAILED"));
    return c.json({ success: false, error: "Ошибка получения статуса экскурсии" }, 500);
  }
});

// POST /api/v1/user/onboarding-tour/complete
userRoutes.post("/onboarding-tour/complete", async (c) => {
  try {
    const user = c.get("user");
    const status = await onboardingTourApplication.complete(user.id);
    return c.json({ success: true, data: status });
  } catch {
    logger.error("Error updating onboarding tour status", new Error("USER_TOUR_UPDATE_FAILED"));
    return c.json({ success: false, error: "Ошибка сохранения статуса экскурсии" }, 500);
  }
});

// PUT /api/v1/user/profile
userRoutes.put(
  "/profile",
  zValidator("json", updateProfileSchema, profileEditValidationError),
  async (c) => {
    try {
      const user = c.get("user");
      const data = c.req.valid("json");
      const profile = await updateProfileApplication.execute({
        actorUserId: user.id,
        data,
      });
      return c.json({ success: true, data: profile }, 200, {
        "Cache-Control": "private, no-store",
      });
    } catch {
      logger.error("Error updating profile", new Error("USER_PROFILE_UPDATE_FAILED"));
      return c.json({ success: false, error: "Ошибка обновления профиля" }, 500);
    }
  },
);

// POST /api/v1/user/avatar — загрузка аватара (multipart/form-data, поле "file")
userRoutes.post("/avatar", async (c) => {
  c.header("Cache-Control", "private, no-store");
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
      return c.json({ success: false, error: "Файл слишком большой. Максимум 5 МБ" }, 400);
    }

    const avatarUrl = await updateAvatar(user.id, file as File);
    return c.json({ success: true, data: { avatarUrl } });
  } catch {
    logger.error("Error uploading avatar", new Error("USER_AVATAR_UPLOAD_FAILED"));
    return c.json({ success: false, error: "Ошибка загрузки аватара" }, 500);
  }
});

// GET /api/v1/user/account/deletion-preflight — own identity + email presence.
// Must not depend on full profile media signing / CDN availability.
userRoutes.get("/account/deletion-preflight", async (c) => {
  c.header("Cache-Control", "private, no-store");
  try {
    const user = c.get("user");
    const result = await readAccountDeletionPreflight(user.id);
    if (!result) return c.json({ success: false, error: "Пользователь не найден" }, 404);
    return c.json({ success: true, data: result }, 200);
  } catch {
    deleteAccountLogger.error("Account deletion preflight unavailable", new Error("ACCOUNT_DELETE_PREFLIGHT_FAILED"));
    return c.json({ success: false, error: "Не удалось проверить аккаунт" }, 500);
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
  } catch {
    deleteAccountLogger.error(
      "Ошибка запроса кода удаления",
      new Error("ACCOUNT_DELETION_CODE_REQUEST_FAILED"),
    );
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// POST /api/v1/user/account/delete — необратимое удаление (код из письма)
userRoutes.post("/account/delete", zValidator("json", deleteUserAccountBodySchema), async (c) => {
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
  } catch {
    deleteAccountLogger.error("Ошибка удаления аккаунта", new Error("ACCOUNT_DELETE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
