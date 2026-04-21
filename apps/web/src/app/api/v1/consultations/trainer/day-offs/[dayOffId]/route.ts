/**
 * DELETE /api/v1/consultations/trainer/day-offs/:dayOffId
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { removeDayOff } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-consultations-day-off-delete");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export const DELETE = withCSRFProtection(
  async (
    _request: NextRequest,
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
      const { dayOffId } = await context.params;
      await removeDayOff(session.user.id, dayOffId);
      return NextResponse.json({ success: true, data: {} });
    } catch (error) {
      logger.error("DELETE day-off", error as Error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
