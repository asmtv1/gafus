/**
 * GET /api/v1/consultations/my
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { cursorPaginationSchema, listClientBookings } from "@gafus/core";
import { AuthorizationError } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

import { logConsultationRouteError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-my");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }
    await requireWebAppSubscriptionOrThrow(session.user.id);
    const sp = request.nextUrl.searchParams;
    const q = cursorPaginationSchema.parse({
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    const data = await listClientBookings(session.user.id, q.cursor, q.limit);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    logConsultationRouteError(logger, "GET my consultations", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
