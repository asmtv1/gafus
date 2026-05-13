/**
 * POST /api/v1/consultations/trainer/bookings/:bookingId/no-show
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { markBookingNoShowByTrainer } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

import { consultationTrainerBookingsTag } from "@/shared/lib/consultation-cache-tags";
import { logConsultationRouteError, mapConsultationError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-trainer-no-show");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export const POST = withCSRFProtection(
  async (
    _request: NextRequest,
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
      const role = session.user.role as AuthRole;
      if (!TRAINER_ROLES.includes(role)) {
        return NextResponse.json(
          { success: false, error: "Недостаточно прав", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
      const { bookingId } = await context.params;
      await markBookingNoShowByTrainer(session.user.id, role, bookingId);
      revalidateTag(consultationTrainerBookingsTag(session.user.id));
      return NextResponse.json({ success: true, data: { bookingId } });
    } catch (error) {
      const mapped = mapConsultationError(error);
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status });
      }
      logConsultationRouteError(logger, "POST no-show booking", error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
