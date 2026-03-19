import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-api-revalidate-articles");

/**
 * API маршрут для инвалидации кэша статей.
 * Вызывается из trainer-panel при создании, обновлении или удалении статьи.
 *
 * POST /api/revalidate/articles
 * Headers: Authorization: Bearer <secret-token>
 * Body: пустой — список; { slug: string } — конкретная статья
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !["ADMIN", "TRAINER"].includes(session.user.role)) {
      const authHeader = request.headers.get("authorization");
      const secretToken = process.env.REVALIDATE_SECRET_TOKEN;

      if (!secretToken || authHeader !== `Bearer ${secretToken}`) {
        logger.warn("[Cache] Unauthorized attempt to invalidate articles cache", {
          userId: session?.user?.id,
          hasAuthHeader: !!authHeader,
          operation: "warn",
        });
        return NextResponse.json(
          { success: false, error: "Недостаточно прав доступа" },
          { status: 403 },
        );
      }
    }

    const body = await request.json().catch(() => ({})) as { slug?: string };
    const slug = typeof body?.slug === "string" ? body.slug : undefined;

    if (slug) {
      revalidatePath(`/articles/${slug}`, "page");
      logger.info("[Cache] Invalidated article page", { slug, operation: "info" });
    } else {
      revalidateTag("articles");
      revalidatePath("/articles", "page");
      logger.info("[Cache] Invalidated articles list", { operation: "info" });
    }

    return NextResponse.json({
      success: true,
      message: slug ? "Страница статьи обновлена" : "Кэш статей инвалидирован",
    });
  } catch (error) {
    logger.error("Error invalidating articles cache", error as Error, {
      operation: "error",
      endpoint: "/api/revalidate/articles",
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
