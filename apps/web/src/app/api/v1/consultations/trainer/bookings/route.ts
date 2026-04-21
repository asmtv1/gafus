/**
 * GET /api/v1/consultations/trainer/bookings
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { listTrainerBookings } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

import { logConsultationRouteError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-trainer-bookings");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export async function GET() {
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
    const data = await listTrainerBookings(session.user.id, role);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logConsultationRouteError(logger, "GET trainer bookings", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
