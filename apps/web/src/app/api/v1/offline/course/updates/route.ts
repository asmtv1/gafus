/**
 * API: GET /api/v1/offline/course/updates - проверить обновления курса
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-offline-course-updates");

const querySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  clientVersion: z.string().min(1, "clientVersion обязателен"),
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
      clientVersion: searchParams.get("clientVersion"),
    });

    // Динамический импорт
    const { checkCourseUpdates } = await import("@shared/lib/actions/offlineCourseActions");

    const result = await checkCourseUpdates(parsed.courseType, parsed.clientVersion);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Ошибка", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        hasUpdates: result.hasUpdates,
        serverVersion: result.serverVersion,
      },
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
    logger.error("API: Error checking course updates", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
