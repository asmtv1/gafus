/**
 * Courses Routes
 * Endpoints для работы с курсами: список, доступ, избранное, метаданные, отзывы
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getCoursesWithProgress,
  checkCourseAccess,
  checkCourseAccessById,
  getFavoritesCourses,
  toggleFavoriteCourse,
  addFavoriteCourse,
  removeFavoriteCourse,
  getCourseMetadata,
  getCourseReviews,
  createCourseReview,
  updateCourseReview,
  deleteCourseReview,
  rateCourse,
} from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-courses");

export const coursesRoutes = new Hono();

// ==================== GET /courses ====================
// Получить список курсов с прогрессом
coursesRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const courses = await getCoursesWithProgress(user.id);

    return c.json(
      { success: true, data: courses },
      {
        headers: {
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (error) {
    logger.error("Error in courses API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/access ====================
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

    let result: { hasAccess: boolean };

    if (courseId) {
      result = await checkCourseAccessById(courseId, user.id);
    } else {
      result = await checkCourseAccess(courseType!, user.id);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in course access API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/favorites ====================
// Получить избранные курсы
coursesRoutes.get("/favorites", async (c) => {
  try {
    const user = c.get("user");
    const result = await getFavoritesCourses(user.id);

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in favorites GET API", error as Error);
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

    let isFavorite: boolean;

    switch (action) {
      case "add":
        await addFavoriteCourse(user.id, courseId);
        isFavorite = true;
        break;
      case "remove":
        await removeFavoriteCourse(user.id, courseId);
        isFavorite = false;
        break;
      default:
        isFavorite = await toggleFavoriteCourse(user.id, courseId);
    }

    return c.json({ success: true, data: { isFavorite } });
  } catch (error) {
    logger.error("Error in favorites POST API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/metadata ====================
// Получить метаданные курса для OG
const metadataQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

coursesRoutes.get("/metadata", zValidator("query", metadataQuerySchema), async (c) => {
  try {
    const { courseType } = c.req.valid("query");
    const metadata = await getCourseMetadata(courseType);

    if (!metadata) {
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
  } catch (error) {
    logger.error("Error in course metadata API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /courses/reviews ====================
// Получить отзывы курса
const reviewsQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

coursesRoutes.get("/reviews", zValidator("query", reviewsQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType } = c.req.valid("query");
    const result = await getCourseReviews(courseType, user?.id);

    if (!result) {
      return c.json({ success: false, error: "Курс не найден" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in reviews GET API", error as Error);
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

    let result;

    if (data.courseType) {
      result = await createCourseReview(user.id, data.courseType, data.rating, data.comment);
    } else if (data.courseId) {
      result = await rateCourse(user.id, data.courseId, data.rating);
    }

    if (!result?.success) {
      return c.json({ success: false, error: result?.error || "Не удалось создать отзыв" }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error in reviews POST API", error as Error);
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

    const result = await updateCourseReview(user.id, reviewId, rating, comment);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error in reviews PATCH API", error as Error);
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

    const result = await deleteCourseReview(user.id, reviewId);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error in reviews DELETE API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
