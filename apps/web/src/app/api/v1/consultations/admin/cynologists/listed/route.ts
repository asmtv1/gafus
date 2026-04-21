/**
 * PUT /api/v1/consultations/admin/cynologists/listed
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { adminSetListedCynologists, adminListedCynologistsInputSchema } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

import { CONSULTATION_CYNOLOGISTS_TAG } from "@/shared/lib/consultation-cache-tags";
import { mapConsultationError, mapZodError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-admin-listed");

const ADMIN_ROLES: AuthRole[] = ["ADMIN", "MODERATOR"];

export const PUT = withCSRFProtection(async (request: NextRequest) => {
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
    const json = await request.json();
    const body = adminListedCynologistsInputSchema.parse(json);
    await adminSetListedCynologists(session.user.id, role, body.cynologistUserIds);
    revalidateTag(CONSULTATION_CYNOLOGISTS_TAG);
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    const mapped = mapConsultationError(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const zod = mapZodError(error);
    if (zod) {
      return NextResponse.json(zod.body, { status: zod.status });
    }
    logger.error("PUT admin listed cynologists", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
