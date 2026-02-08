/**
 * API: GET /api/v1/offline/course/download - скачать полный курс
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-offline-course-download");

const querySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { searchParams } = request.nextUrl;
    const parsed = querySchema.parse({
      courseType: searchParams.get("courseType"),
    });

    // Динамический импорт
    const { downloadFullCourse } = await import("@shared/lib/actions/offlineCourseActions");

    const result = await downloadFullCourse(parsed.courseType);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Ошибка", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.errors[0]?.message || "Ошибка валидации",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }
    logger.error("API: Error downloading course", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
