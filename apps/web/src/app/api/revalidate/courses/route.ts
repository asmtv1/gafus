import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-api-revalidate-courses");

/**
 * API маршрут для инвалидации кэша курсов
 * Вызывается из trainer-panel при создании, обновлении или удалении курса
 *
 * POST /api/revalidate/courses
 * Headers: Authorization: Bearer <secret-token> (опционально)
 * Body: пустой или { courseId?: string }
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
        logger.warn("[Cache] Unauthorized attempt to invalidate courses cache", {
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

    logger.warn("[Cache] Invalidating courses cache", {
      userId: session?.user?.id,
      role: session?.user?.role,
      operation: "warn",
    });

    // Инвалидируем все теги кэша курсов
    revalidateTag("courses");
    revalidateTag("courses-all");
    revalidateTag("courses-all-permanent");
    revalidateTag("courses-favorites");
    revalidateTag("courses-metadata");

    // Инвалидируем ISR кэш страниц с курсами
    revalidatePath("/courses", "page");
    revalidatePath("/favorites", "page");

    logger.warn("[Cache] Courses cache invalidated successfully", {
      userId: session?.user?.id,
      operation: "warn",
    });

    return NextResponse.json({
      success: true,
      message: "Кэш курсов успешно инвалидирован",
    });
  } catch (error) {
    logger.error("❌ Error invalidating courses cache:", error as Error, {
      operation: "error",
      endpoint: "/api/revalidate/courses",
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
