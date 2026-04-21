/**
 * GET /api/v1/consultations/cynologists — список кинологов для записи.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listListedCynologists } from "@gafus/core";
import { AuthorizationError } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

import { logConsultationRouteError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-cynologists");

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }
    const data = await listListedCynologists();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    logConsultationRouteError(logger, "GET consultations/cynologists", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
