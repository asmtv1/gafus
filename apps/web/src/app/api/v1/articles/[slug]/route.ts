import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getArticleBySlug } from "@gafus/core/services/article";
import { createWebLogger } from "@gafus/logger";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

const logger = createWebLogger("api-article");

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (userId) {
      await requireWebAppSubscriptionOrThrow(userId);
    }

    const result = await getArticleBySlug(slug, userId);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    logger.error("Error in article GET", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
