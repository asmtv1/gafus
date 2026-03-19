import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { toggleArticleLike } from "@gafus/core/services/article";
import { revalidateTag } from "next/cache";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-article-like");

type RouteContext = { params: Promise<{ slug: string }> };

export const POST = withCSRFProtection(async (
  _request: NextRequest,
  context: RouteContext
) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { slug: articleId } = await context.params;

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: "ID статьи обязателен" },
        { status: 400 }
      );
    }

    const isLiked = await toggleArticleLike(session.user.id, articleId);
    revalidateTag("articles");

    return NextResponse.json({ success: true, data: { isLiked } });
  } catch (error) {
    logger.error("Error in article like POST", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});
