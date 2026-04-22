/**
 * DELETE /api/v1/consultations/trainer/day-offs/:dayOffId
 * Query: trainerUserId — для ADMIN/MODERATOR.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { ConsultationForbiddenError, removeDayOff } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

import { logConsultationRouteError, mapConsultationError } from "@/shared/lib/consultation-route-errors";
import { resolveTrainerUserIdFromSession } from "@/shared/lib/consultation-target-trainer";

const logger = createWebLogger("api-consultations-day-off-delete");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export const DELETE = withCSRFProtection(
  async (
    request: NextRequest,
    context: { params: Promise<{ dayOffId: string }> },
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
      const trainerUserId = request.nextUrl.searchParams.get("trainerUserId");
      let targetId: string;
      try {
        targetId = await resolveTrainerUserIdFromSession(session, trainerUserId);
      } catch (e) {
        const mapped = e instanceof ConsultationForbiddenError ? mapConsultationError(e) : null;
        if (mapped) {
          return NextResponse.json(mapped.body, { status: mapped.status });
        }
        throw e;
      }
      const { dayOffId } = await context.params;
      await removeDayOff(targetId, dayOffId);
      return NextResponse.json({ success: true, data: {} });
    } catch (error) {
      logConsultationRouteError(logger, "DELETE day-off", error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
