/**
 * API Route: GET /api/v1/courses/access
 *
 * Проверяет доступ пользователя к курсу.
 * Query params: courseType или courseId
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { checkCourseAccess, checkCourseAccessById } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-courses");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { searchParams } = new URL(request.url);
    const courseType = searchParams.get("courseType");
    const courseId = searchParams.get("courseId");

    if (!courseType && !courseId) {
      return NextResponse.json(
        { success: false, error: "Требуется courseType или courseId" },
        { status: 400 },
      );
    }

    let result: { hasAccess: boolean };

    if (courseId) {
      result = await checkCourseAccessById(courseId, userId);
    } else {
      result = await checkCourseAccess(courseType!, userId);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in course access API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
