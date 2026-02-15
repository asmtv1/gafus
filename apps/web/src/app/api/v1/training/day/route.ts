/**
 * API: GET /api/v1/training/day - получить день с шагами пользователя
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { getTrainingDayWithUserSteps } from "@gafus/core/services/training";
import { checkCourseAccess } from "@gafus/core/services/course";
import { dayOnCourseIdSchema } from "@shared/lib/validation/schemas";
import { z } from "zod";

const logger = createWebLogger("api-training-day");

const querySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  dayOnCourseId: dayOnCourseIdSchema,
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

    const result = await getTrainingDayWithUserSteps(
      session.user.id,
      parsed.courseType,
      parsed.dayOnCourseId,
      {
        createIfMissing: parsed.createIfMissing,
      },
    );

    if (!result) {
      const access = await checkCourseAccess(parsed.courseType, session.user.id);
      if (!access.hasAccess) {
        return NextResponse.json(
          { success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { success: false, error: "День тренировки не найден", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PERSONALIZATION_REQUIRED") {
      return NextResponse.json(
        {
          success: false,
          error: "Для этого курса нужно заполнить персонализацию",
          code: "PERSONALIZATION_REQUIRED",
        },
        { status: 428 },
      );
    }
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
