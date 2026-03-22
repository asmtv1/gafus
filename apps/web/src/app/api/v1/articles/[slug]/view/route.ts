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

/** POST — учитывает просмотр статьи (+1). Вызывается при открытии страницы статьи. */
export const POST = withCSRFProtection(async (
  _request: NextRequest,
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

    const session = await getServerSession(authOptions);
    const viewerUserId = session?.user?.id ?? null;

    const result = await incrementArticleView(slug, viewerUserId);
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
