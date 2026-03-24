import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { incrementArticleView } from "@gafus/core/services/article";
import { revalidateTag } from "next/cache";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-article-view");

type RouteContext = { params: Promise<{ slug: string }> };

/** POST — учитывает уникальный просмотр статьи. Тело: `{ visitorKey?: string }` для гостей. */
export const POST = withCSRFProtection(async (
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> => {
  try {
    const { slug } = await context.params;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Slug обязателен" },
        { status: 400 }
      );
    }

    let guestVisitorKey: string | null = null;
    try {
      const raw = await request.text();
      if (raw) {
        const body = JSON.parse(raw) as { visitorKey?: unknown };
        if (typeof body.visitorKey === "string") {
          guestVisitorKey = body.visitorKey;
        }
      }
    } catch {
      // пустое или невалидное тело — только сессия
    }

    const session = await getServerSession(authOptions);
    const viewerUserId = session?.user?.id ?? null;

    const result = await incrementArticleView(slug, {
      viewerUserId,
      guestVisitorKey,
    });
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Ошибка" },
        { status: 404 }
      );
    }

    revalidateTag("articles");
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error in article view POST", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});
