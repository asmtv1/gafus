/**
 * API: GET /api/v1/training/days - получить дни тренировок курса
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";
import { getTrainingDays } from "@gafus/core/services/training";
import { z } from "zod";

const logger = createWebLogger("api-training-days");
const querySchema = z.object({
  type: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { searchParams } = request.nextUrl;
    const { type } = querySchema.parse({
      type: searchParams.get("type") || undefined,
    });

    const result = await getTrainingDays(session.user.id, type);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      return NextResponse.json(
        { success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" },
        { status: 403 },
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
    logger.error("API: Error fetching training days", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
