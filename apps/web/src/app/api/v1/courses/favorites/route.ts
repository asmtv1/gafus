/**
 * API Route: /api/v1/courses/favorites
 *
 * GET - Получает список избранных курсов
 * POST - Переключает статус избранного (toggle)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  getFavoritesCourses,
  toggleFavoriteCourse,
  addFavoriteCourse,
  removeFavoriteCourse,
} from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-favorites");

// GET - Получить избранные курсы
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const result = await getFavoritesCourses(userId);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in favorites GET API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

// POST - Toggle/Add/Remove избранное
const toggleSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  action: z.enum(["toggle", "add", "remove"]).default("toggle"),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { courseId, action } = toggleSchema.parse(body);

    let isFavorite: boolean;

    switch (action) {
      case "add":
        await addFavoriteCourse(userId, courseId);
        isFavorite = true;
        break;
      case "remove":
        await removeFavoriteCourse(userId, courseId);
        isFavorite = false;
        break;
      default:
        isFavorite = await toggleFavoriteCourse(userId, courseId);
    }

    return NextResponse.json({ success: true, data: { isFavorite } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in favorites POST API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
