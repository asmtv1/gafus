/**
 * API: POST /api/v1/exam/submit - отправить результат экзамена
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-exam-submit");

const submitExamSchema = z.object({
  userStepId: z.string().uuid("userStepId должен быть UUID"),
  stepId: z.string().uuid("stepId должен быть UUID"),
  testAnswers: z.record(z.string(), z.number()).optional(),
  testScore: z.number().optional(),
  testMaxScore: z.number().optional(),
  videoReportUrl: z.string().optional(),
  writtenFeedback: z.string().optional(),
  overallScore: z.number().optional(),
  isPassed: z.boolean().optional(),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const body = await request.json();
    const parsed = submitExamSchema.parse(body);

    // Динамический импорт
    const { submitExamResult } = await import("@shared/lib/actions/submitExamResult");

    const result = await submitExamResult(parsed);

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
    logger.error("API: Error submitting exam result", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
});
