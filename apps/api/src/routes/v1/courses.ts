/**
 * Courses Routes
 * Endpoints для работы с курсами: список, доступ, избранное, метаданные, отзывы
 */
import { Hono } from "hono";
import type { CourseWithProgressWireConformance } from
  "../../../../../packages/types/src/data/course";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { createWebLogger } from "@gafus/logger";
import { courseReadApplication } from "../../modules/courses/composition/read-courses.js";
import { readCourseAccessApplication } from "../../modules/courses/composition/read-access.js";
import { writeCoursePersonalizationApplication } from "../../modules/courses/composition/write-personalization.js";
import { writeFavoriteApplication } from "../../modules/courses/composition/write-favorite.js";
import { writeReviewsApplication } from "../../modules/courses/composition/write-reviews.js";

const logger = createWebLogger("api-courses");

export const coursesRoutes = new Hono();

// ==================== GET /courses ====================
// Получить список курсов с прогрессом
coursesRoutes.get("/", async (c) => {
  // A Core failure must not lose privacy headers from the personalized list.
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    const user = c.get("user");
    const courses = await courseReadApplication.getCatalog({ actorUserId: user.id });

    const body = { success: true as const, data: courses };
    return c.json(
      body satisfies CourseWithProgressWireConformance<typeof body>,
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    logger.error("Error in courses API", new Error("COURSES_LIST_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/access ====================
// Actor-specific entitlement decisions must not enter shared/browser caches,
// including early query validation and Core errors.
coursesRoutes.use("/access", async (c, next) => {
  if (c.req.method !== "GET") return next();
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
// Проверить доступ к курсу
const accessQuerySchema = z.object({
  courseType: z.string().optional(),
  courseId: z.string().optional(),
});

coursesRoutes.get("/access", zValidator("query", accessQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType, courseId } = c.req.valid("query");

    if (!courseType && !courseId) {
      return c.json({ success: false, error: "Требуется courseType или courseId" }, 400);
    }

    const result = await readCourseAccessApplication.execute({
      actorUserId: user.id,
      courseType,
      courseId,
    });

    return c.json({ success: true, data: result });
  } catch {
    logger.error("Error in course access API", new Error("COURSE_ACCESS_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/favorites ====================
// The list, mutation outcome and validation failures are user-specific.
// Attach privacy headers before route validation; don't let a cache reuse them.
coursesRoutes.use("/favorites", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});
// Получить избранные курсы
coursesRoutes.get("/favorites", async (c) => {
  try {
    const user = c.get("user");
    const result = await courseReadApplication.getFavorites({ actorUserId: user.id });

    return c.json({ success: true, data: result });
  } catch {
    logger.error("Error in favorites GET API", new Error("COURSE_FAVORITES_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /courses/favorites ====================
// Toggle/Add/Remove избранное
const toggleFavoriteSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  action: z.enum(["toggle", "add", "remove"]).default("toggle"),
});

coursesRoutes.post("/favorites", zValidator("json", toggleFavoriteSchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, action } = c.req.valid("json");

    const isFavorite = await writeFavoriteApplication.execute({
      actorUserId: user.id,
      courseId,
      action,
    });

    return c.json({ success: true, data: { isFavorite } });
  } catch {
    logger.error("Error in favorites POST API", new Error("COURSE_FAVORITES_UPDATE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /courses/personalization ====================
// Сохранить персонализацию курса
const savePersonalizationSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  userDisplayName: z.string().trim().min(1, "Укажите имя"),
  userGender: z.enum(["male", "female"]),
  petName: z.string().trim().min(1, "Укажите кличку питомца"),
  petGender: z.enum(["male", "female"]).nullable().optional(),
  petNameGen: z.string().trim().nullable().optional(),
  petNameDat: z.string().trim().nullable().optional(),
  petNameAcc: z.string().trim().nullable().optional(),
  petNameIns: z.string().trim().nullable().optional(),
  petNamePre: z.string().trim().nullable().optional(),
});

coursesRoutes.post(
  "/personalization",
  zValidator("json", savePersonalizationSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const payload = c.req.valid("json");
      const result = await writeCoursePersonalizationApplication.execute({
        actorUserId: user.id,
        courseId: payload.courseId,
        payload,
      });

      if (!result.success) {
        return c.json({ success: false, error: result.error, code: "VALIDATION_ERROR" }, 400);
      }

      return c.json({ success: true });
    } catch {
      logger.error("Error in course personalization API", new Error("COURSE_PERSONALIZATION_FAILED"));
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

// ==================== GET /courses/metadata ====================
// Получить метаданные курса для OG
const metadataQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

coursesRoutes.get("/metadata", zValidator("query", metadataQuerySchema), async (c) => {
  try {
    const { courseType } = c.req.valid("query");
    const metadata = await courseReadApplication.getMetadata({ courseType });

    if (!metadata || metadata.isPrivate) {
      return c.json({ success: false, error: "Курс не найден" }, 404);
    }

    return c.json(
      { success: true, data: metadata },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  } catch {
    logger.error("Error in course metadata API", new Error("COURSE_METADATA_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/reviews ====================
// The response includes actor-specific completion and userReview status.
// Prevent caching even if query validation, lookup or Core fails.
coursesRoutes.use("/reviews", async (c, next) => {
  if (c.req.method !== "GET") return next();
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
// Получить отзывы курса
const reviewsQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

coursesRoutes.get("/reviews", zValidator("query", reviewsQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType } = c.req.valid("query");
    const result = await courseReadApplication.getReviews({ courseType, actorUserId: user?.id });

    if (!result) {
      return c.json({ success: false, error: "Курс не найден" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch {
    logger.error("Error in reviews GET API", new Error("COURSE_REVIEWS_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /courses/reviews ====================
// Создать отзыв или рейтинг
const createReviewSchema = z
  .object({
    courseType: z.string().optional(),
    courseId: z.string().optional(),
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
  })
  .refine((data) => data.courseType || data.courseId, {
    message: "Требуется courseType или courseId",
  });

coursesRoutes.post("/reviews", zValidator("json", createReviewSchema), async (c) => {
  try {
    const user = c.get("user");
    const data = c.req.valid("json");

    const result = await writeReviewsApplication.createOrRate({
      actorUserId: user.id,
      courseType: data.courseType,
      courseId: data.courseId,
      rating: data.rating,
      comment: data.comment,
    });

    if (!result?.success) {
      return c.json({ success: false, error: result?.error || "Не удалось создать отзыв" }, 400);
    }

    return c.json({ success: true });
  } catch {
    logger.error("Error in reviews POST API", new Error("COURSE_REVIEWS_CREATE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== PATCH /courses/reviews ====================
// Обновить отзыв
const updateReviewSchema = z.object({
  reviewId: z.string().min(1, "reviewId обязателен"),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

coursesRoutes.patch("/reviews", zValidator("json", updateReviewSchema), async (c) => {
  try {
    const user = c.get("user");
    const { reviewId, rating, comment } = c.req.valid("json");

    const result = await writeReviewsApplication.update({
      actorUserId: user.id,
      reviewId,
      rating,
      comment,
    });

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true });
  } catch {
    logger.error("Error in reviews PATCH API", new Error("COURSE_REVIEWS_UPDATE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== DELETE /courses/reviews ====================
// Удалить отзыв
const deleteReviewSchema = z.object({
  reviewId: z.string().min(1, "reviewId обязателен"),
});

coursesRoutes.delete("/reviews", zValidator("json", deleteReviewSchema), async (c) => {
  try {
    const user = c.get("user");
    const { reviewId } = c.req.valid("json");

    const result = await writeReviewsApplication.remove({ actorUserId: user.id, reviewId });

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true });
  } catch {
    logger.error("Error in reviews DELETE API", new Error("COURSE_REVIEWS_DELETE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
