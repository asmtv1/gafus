/**
 * API: GET /api/v1/training/days - получить дни тренировок курса
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { AuthorizationError } from "@gafus/core/errors";

const logger = createWebLogger('api-training-days');

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || undefined;

    // Динамический импорт для избежания проблем с getCurrentUserId на сервере
    const { getTrainingDays } = await import("@shared/lib/training/getTrainingDays");
    
    const result = await getTrainingDays(type, session.user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message, code: "UNAUTHORIZED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      return NextResponse.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, { status: 403 });
    }
    logger.error("API: Error fetching training days", error as Error);
    return NextResponse.json({ success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
