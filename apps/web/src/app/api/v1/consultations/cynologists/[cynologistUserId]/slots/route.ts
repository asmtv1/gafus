/**
 * GET /api/v1/consultations/cynologists/:id/slots
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getAvailableSlots,
  getConsultationBookingEligibility,
  getCalendarSlots,
  getCynologistDayOffDates,
  getSlotsQuerySchema,
  requireConsultationSlotsSubscriptionAccess,
} from "@gafus/core";
import { AuthorizationError } from "@gafus/core/errors";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import { createWebLogger } from "@gafus/logger";

import { logConsultationRouteError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-slots");

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ cynologistUserId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }
    const { cynologistUserId } = await context.params;
    const sp = _request.nextUrl.searchParams;
    const parsed = getSlotsQuerySchema.parse({
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
    });
    const includeBusy = sp.get("includeBusy") === "1";
    const from = new Date(parsed.from);
    const to = new Date(parsed.to);
    await requireConsultationSlotsSubscriptionAccess({
      userId: session.user.id,
    });
    const data = includeBusy
      ? await getCalendarSlots(cynologistUserId, from, to)
      : await getAvailableSlots(cynologistUserId, from, to);
    const dayOffDates = await getCynologistDayOffDates(cynologistUserId, from, to);
    const bookingEligibility = await getConsultationBookingEligibility(session.user.id);
    return NextResponse.json({ success: true, data, dayOffDates, bookingEligibility }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: 402 },
      );
    }
    logConsultationRouteError(logger, "GET slots", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
