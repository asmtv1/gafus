/**
 * DELETE /api/v1/consultations/trainer/exceptions/:exceptionId
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { removeSlotException } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-consultations-exception-delete");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

export const DELETE = withCSRFProtection(
  async (
    _request: NextRequest,
    context: { params: Promise<{ exceptionId: string }> },
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
      const { exceptionId } = await context.params;
      await removeSlotException(session.user.id, exceptionId);
      return NextResponse.json({ success: true, data: {} });
    } catch (error) {
      logger.error("DELETE exception", error as Error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
