/**
 * POST /api/v1/consultations/trainer/bookings/:bookingId/reject
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { rejectBookingByTrainer } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { consultationTrainerBookingsTag } from "@/shared/lib/consultation-cache-tags";
import { mapConsultationError, mapZodError } from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-trainer-reject");

const TRAINER_ROLES: AuthRole[] = ["TRAINER", "ADMIN", "MODERATOR"];

const bodySchema = z.object({ reason: z.string().max(500).optional() });

export const POST = withCSRFProtection(
  async (
    request: NextRequest,
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
      const json = await request.json().catch(() => ({}));
      const body = bodySchema.parse(json);
      await rejectBookingByTrainer(session.user.id, role, bookingId, body.reason);
      revalidateTag(consultationTrainerBookingsTag(session.user.id));
      return NextResponse.json({ success: true, data: { bookingId } });
    } catch (error) {
      const mapped = mapConsultationError(error);
      if (mapped) {
        return NextResponse.json(mapped.body, { status: mapped.status });
      }
      const zod = mapZodError(error);
      if (zod) {
        return NextResponse.json(zod.body, { status: zod.status });
      }
      logger.error("POST reject booking", error as Error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  },
);
