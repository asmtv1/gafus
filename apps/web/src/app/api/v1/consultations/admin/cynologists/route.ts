/**
 * GET /api/v1/consultations/admin/cynologists
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { listAllTrainersForAdmin } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-consultations-admin-cynologists");

const ADMIN_ROLES: AuthRole[] = ["ADMIN", "MODERATOR"];

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
    if (!ADMIN_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: "Недостаточно прав", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const data = await listAllTrainersForAdmin();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("GET admin cynologists", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
