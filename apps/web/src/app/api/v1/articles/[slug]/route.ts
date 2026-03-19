import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getArticleBySlug } from "@gafus/core/services/article";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-article");

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const result = await getArticleBySlug(slug, userId);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error in article GET", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
