/**
 * GET|PUT /api/v1/consultations/trainer/availability
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  getTrainerAvailability,
  setTrainerAvailability,
  trainerAvailabilityInputSchema,
} from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

import { logConsultationRouteError, mapZodError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-trainer-availability");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

function requireTrainer(session: { user: { id: string; role: string } } | null) {
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
  return null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireTrainer(session);
    if (denied) {
      return denied;
    }
    const data = await getTrainerAvailability(session!.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logConsultationRouteError(logger, "GET trainer availability", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

export const PUT = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireTrainer(session);
    if (denied) {
      return denied;
    }
    const json = await request.json();
    const body = trainerAvailabilityInputSchema.parse(json);
    await setTrainerAvailability(session!.user.id, body);
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    const zod = mapZodError(error);
    if (zod) {
      return NextResponse.json(zod.body, { status: zod.status });
    }
    logConsultationRouteError(logger, "PUT trainer availability", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
