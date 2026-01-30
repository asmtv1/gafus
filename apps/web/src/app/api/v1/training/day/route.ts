/**
 * API: GET /api/v1/training/day - получить день с шагами пользователя
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-training-day");

const querySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  dayOnCourseId: z.string().uuid("dayOnCourseId должен быть UUID"),
  createIfMissing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
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
      dayOnCourseId: searchParams.get("dayOnCourseId"),
      createIfMissing: searchParams.get("createIfMissing") || "false",
    });

    // Динамический импорт
    const { getTrainingDayWithUserSteps } = await import(
      "@shared/lib/training/getTrainingDayWithUserSteps"
    );

    const result = await getTrainingDayWithUserSteps(parsed.courseType, parsed.dayOnCourseId, {
      createIfMissing: parsed.createIfMissing,
    });

    if (!result.training) {
      return NextResponse.json(
        { success: false, error: "День тренировки не найден", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result.training,
      requiresPersonalization: result.requiresPersonalization,
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
    logger.error("API: Error fetching training day", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
