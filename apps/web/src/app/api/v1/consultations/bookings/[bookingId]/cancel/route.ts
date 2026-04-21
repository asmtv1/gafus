/**
 * POST /api/v1/consultations/bookings/:bookingId/cancel
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { cancelBookingByUser, cancelBookingBodySchema } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

import { consultationUserBookingsTag } from "@/shared/lib/consultation-cache-tags";
import {
  logConsultationRouteError,
  mapConsultationError,
  mapZodError,
} from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-cancel");

export const POST = withCSRFProtection(
  async (
    request: NextRequest,
    context: { params: Promise<{ bookingId: string }> },
  ) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
          { status: 401 },
        );
      }
      const { bookingId } = await context.params;
      const json = await request.json().catch(() => ({}));
      const body = cancelBookingBodySchema.parse(json);
      await cancelBookingByUser(session.user.id, bookingId);
      revalidateTag(consultationUserBookingsTag(session.user.id));
      return NextResponse.json({ success: true, data: { bookingId, reason: body.reason } });
    } catch (error) {
      const mapped = mapConsultationError(error);
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status });
      }
      const zod = mapZodError(error);
      if (zod) {
        return NextResponse.json(zod.body, { status: zod.status });
      }
      logConsultationRouteError(logger, "POST cancel booking", error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
