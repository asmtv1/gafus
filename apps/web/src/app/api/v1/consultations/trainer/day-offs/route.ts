/**
 * POST /api/v1/consultations/trainer/day-offs
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { addDayOff, dayOffInputSchema } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

import { mapZodError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-day-offs");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export const POST = withCSRFProtection(async (request: NextRequest) => {
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
    const json = await request.json();
    const body = dayOffInputSchema.parse(json);
    await addDayOff(session.user.id, body.date, body.reason);
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    const zod = mapZodError(error);
    if (zod) {
      return NextResponse.json(zod.body, { status: zod.status });
    }
    logger.error("POST day-off", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
