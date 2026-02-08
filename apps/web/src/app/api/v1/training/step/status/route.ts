/**
 * API: POST /api/v1/training/step/status - обновить статус шага
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { z } from "zod";

const logger = createWebLogger("api-training-step-status");

const updateStatusSchema = z.object({
  courseId: z.string().uuid("courseId должен быть UUID"),
  dayOnCourseId: z.string().uuid("dayOnCourseId должен быть UUID"),
  stepIndex: z.number().int().min(0, "stepIndex должен быть >= 0"),
  status: z.nativeEnum(TrainingStatus),
  stepTitle: z.string().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const body = await request.json();
    const parsed = updateStatusSchema.parse(body);

    // Динамический импорт
    const { updateUserStepStatus } = await import("@shared/lib/training/updateUserStepStatus");

    const result = await updateUserStepStatus(
      session.user.id,
      parsed.courseId,
      parsed.dayOnCourseId,
      parsed.stepIndex,
      parsed.status,
      parsed.stepTitle,
      parsed.stepOrder,
    );

    return NextResponse.json({ success: result.success });
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
    logger.error("API: Error updating step status", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
});
