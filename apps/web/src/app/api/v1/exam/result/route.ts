/**
 * API: GET /api/v1/exam/result - получить результат экзамена
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { userStepIdSchema } from "@shared/lib/validation/schemas";
import { z } from "zod";

const logger = createWebLogger("api-exam-result");

const querySchema = z.object({
  userStepId: userStepIdSchema,
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { searchParams } = request.nextUrl;
    const parsed = querySchema.parse({
      userStepId: searchParams.get("userStepId"),
    });

    // Динамический импорт
    const { getExamResult } = await import("@shared/lib/actions/getExamResult");

    const result = await getExamResult(parsed.userStepId);

    return NextResponse.json({
      success: true,
      data: result,
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
    if (error instanceof Error && error.message === "Шаг не найден или нет доступа") {
      return NextResponse.json(
        { success: false, error: "Шаг не найден или нет доступа", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    logger.error("API: Error getting exam result", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
