/**
 * GET|PUT /api/v1/consultations/trainer/availability
 * Query: trainerUserId — для ADMIN/MODERATOR (чужое расписание); для TRAINER не нужен.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  ConsultationForbiddenError,
  getTrainerAvailability,
  setTrainerAvailability,
  trainerAvailabilityInputSchema,
} from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

import {
  logConsultationRouteError,
  mapConsultationError,
  mapZodError,
} from "@/shared/lib/consultation-route-errors";
import { resolveTrainerUserIdFromSession } from "@/shared/lib/consultation-target-trainer";

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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireTrainer(session);
    if (denied) {
      return denied;
    }
    const trainerUserId = request.nextUrl.searchParams.get("trainerUserId");
    let targetId: string;
    try {
      targetId = await resolveTrainerUserIdFromSession(session!, trainerUserId);
    } catch (e) {
      const mapped = e instanceof ConsultationForbiddenError ? mapConsultationError(e) : null;
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status });
      }
      throw e;
    }
    const data = await getTrainerAvailability(targetId);
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
    const trainerUserId = request.nextUrl.searchParams.get("trainerUserId");
    let targetId: string;
    try {
      targetId = await resolveTrainerUserIdFromSession(session!, trainerUserId);
    } catch (e) {
      const mapped = e instanceof ConsultationForbiddenError ? mapConsultationError(e) : null;
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status });
      }
      throw e;
    }
    const json = await request.json();
    const body = trainerAvailabilityInputSchema.parse(json);
    await setTrainerAvailability(targetId, body);
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    const zod = mapZodError(error);
    if (zod) {
      return NextResponse.json(zod.body, { status: zod.status });
    }
    if (error instanceof ConsultationForbiddenError) {
      const m = mapConsultationError(error);
      if (m) {
        return NextResponse.json(m.body, { status: m.status });
      }
    }
    logConsultationRouteError(logger, "PUT trainer availability", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
