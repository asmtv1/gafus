/**
 * API Route: /api/v1/courses/reviews
 *
 * GET - Получает отзывы курса
 * POST - Создаёт новый отзыв
 * PATCH - Обновляет отзыв
 * DELETE - Удаляет отзыв
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  getCourseReviews,
  createCourseReview,
  updateCourseReview,
  deleteCourseReview,
  rateCourse,
} from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-reviews");

// GET - Получить отзывы
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { searchParams } = new URL(request.url);
    const courseType = searchParams.get("courseType");

    if (!courseType) {
      return NextResponse.json({ success: false, error: "Требуется courseType" }, { status: 400 });
    }

    const result = await getCourseReviews(courseType, userId);

    if (!result) {
      return NextResponse.json({ success: false, error: "Курс не найден" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in reviews GET API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

// POST - Создать отзыв или выставить рейтинг
const createSchema = z
  .object({
    courseType: z.string().optional(),
    courseId: z.string().optional(),
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
  })
  .refine((data) => data.courseType || data.courseId, {
    message: "Требуется courseType или courseId",
  });

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const data = createSchema.parse(body);

    let result;

    if (data.courseType) {
      // Создание отзыва с комментарием по courseType
      result = await createCourseReview(userId, data.courseType, data.rating, data.comment);
    } else if (data.courseId) {
      // Простой рейтинг по courseId
      result = await rateCourse(userId, data.courseId, data.rating);
    }

    if (!result?.success) {
      return NextResponse.json(
        { success: false, error: result?.error || "Не удалось создать отзыв" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in reviews POST API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});

// PATCH - Обновить отзыв
const updateSchema = z.object({
  reviewId: z.string().min(1, "reviewId обязателен"),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export const PATCH = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { reviewId, rating, comment } = updateSchema.parse(body);

    const result = await updateCourseReview(userId, reviewId, rating, comment);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in reviews PATCH API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});

// DELETE - Удалить отзыв
const deleteSchema = z.object({
  reviewId: z.string().min(1, "reviewId обязателен"),
});

export const DELETE = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { reviewId } = deleteSchema.parse(body);

    const result = await deleteCourseReview(userId, reviewId);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in reviews DELETE API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
