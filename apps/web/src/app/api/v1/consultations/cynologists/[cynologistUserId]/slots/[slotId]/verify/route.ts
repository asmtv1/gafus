/**
 * GET /api/v1/consultations/cynologists/:cynologistUserId/slots/:slotId/verify
 * Проверка, что слот ещё свободен перед переходом на страницу подтверждения.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { verifyConsultationSlotFreeForCynologist } from "@gafus/core";
import { AuthorizationError } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

import { mapConsultationError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-slot-verify");

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ cynologistUserId: string; slotId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }
    const { cynologistUserId, slotId } = await context.params;
    await verifyConsultationSlotFreeForCynologist(slotId, cynologistUserId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const mapped = mapConsultationError(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    logger.error("GET slot verify", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
