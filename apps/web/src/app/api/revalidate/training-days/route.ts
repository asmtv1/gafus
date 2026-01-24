import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-api-revalidate-training-days");

/**
 * API маршрут для инвалидации кэша дней тренировок
 * Вызывается из trainer-panel при обновлении курса
 *
 * POST /api/revalidate/training-days
 * Headers: Authorization: Bearer <secret-token> (опционально)
 * Body: { courseId?: string } // опционально для инвалидации конкретного курса
 */
export async function POST(request: Request) {
  try {
    // Проверяем авторизацию через сессию
    const session = await getServerSession(authOptions);

    // Разрешаем доступ только ADMIN и TRAINER
    if (!session?.user || !["ADMIN", "TRAINER"].includes(session.user.role)) {
      // Также проверяем секретный токен для межсервисных вызовов
      const authHeader = request.headers.get("authorization");
      const secretToken = process.env.REVALIDATE_SECRET_TOKEN;

      if (!secretToken || authHeader !== `Bearer ${secretToken}`) {
        logger.warn("[Cache] Unauthorized attempt to invalidate training days cache", {
          userId: session?.user?.id,
          role: session?.user?.role,
          hasAuthHeader: !!authHeader,
          operation: "warn",
        });
        return NextResponse.json(
          { success: false, error: "Недостаточно прав доступа" },
          { status: 403 },
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const { courseId } = body as { courseId?: string };

    logger.warn("[Cache] Invalidating training days cache", {
      userId: session?.user?.id,
      role: session?.user?.role,
      courseId,
      operation: "warn",
    });

    // Инвалидируем теги кэша дней тренировок
    revalidateTag("training");
    revalidateTag("days");

    logger.warn("[Cache] Training days cache invalidated successfully", {
      userId: session?.user?.id,
      courseId,
      operation: "warn",
    });

    return NextResponse.json({
      success: true,
      message: "Кэш дней тренировок успешно инвалидирован",
      courseId,
    });
  } catch (error) {
    logger.error("❌ Error invalidating training days cache:", error as Error, {
      operation: "error",
      endpoint: "/api/revalidate/training-days",
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
