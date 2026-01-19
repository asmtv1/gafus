/**
 * API Route: GET /api/v1/courses
 * 
 * Получает список курсов с прогрессом пользователя.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getCoursesWithProgress } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('api-courses');

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const courses = await getCoursesWithProgress(userId);

    return NextResponse.json(
      { success: true, data: courses },
      {
        headers: {
          "Cache-Control": "private, max-age=60", // 1 минута
        },
      }
    );
  } catch (error) {
    logger.error("Error in courses API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
