/**
 * API Route: GET /api/v1/courses/metadata
 *
 * Получает метаданные курса для Open Graph.
 * Query params: courseType
 */

import { NextRequest, NextResponse } from "next/server";
import { getCourseMetadata } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-courses");

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseType = searchParams.get("courseType");

    if (!courseType) {
      return NextResponse.json({ success: false, error: "Требуется courseType" }, { status: 400 });
    }

    const metadata = await getCourseMetadata(courseType);

    if (!metadata) {
      return NextResponse.json({ success: false, error: "Курс не найден" }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, data: metadata },
      {
        headers: {
          "Cache-Control": "public, max-age=3600", // 1 час
        },
      },
    );
  } catch (error) {
    logger.error("Error in course metadata API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
