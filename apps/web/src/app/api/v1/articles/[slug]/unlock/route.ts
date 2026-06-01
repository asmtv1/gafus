import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { unlockArticleBySlug } from "@gafus/core/services/article";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-article-unlock");

type RouteContext = { params: Promise<{ slug: string }> };

export const POST = withCSRFProtection(async (_request: NextRequest, context: RouteContext) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { slug } = await context.params;
    const result = await unlockArticleBySlug({
      slug,
      userId: session.user.id,
      platform: "WEB_DESKTOP",
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("Error in article unlock POST", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
