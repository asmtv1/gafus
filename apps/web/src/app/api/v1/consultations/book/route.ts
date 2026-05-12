/**
 * POST /api/v1/consultations/book
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { bookSlot, bookSlotInputSchema } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";
import { requireWebAppSubscriptionOrThrow } from "@shared/lib/app-subscription/server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";

import {
  consultationTrainerBookingsTag,
  consultationUserBookingsTag,
} from "@/shared/lib/consultation-cache-tags";
import {
  logConsultationRouteError,
  mapConsultationError,
  mapZodError,
} from "@/shared/lib/consultation-route-errors";

const logger = createWebLogger("api-consultations-book");

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    await requireWebAppSubscriptionOrThrow(session.user.id);
    const json = await request.json();
    const body = bookSlotInputSchema.parse(json);
    const requestId = request.headers.get("x-request-id") ?? undefined;
    const result = await bookSlot(session.user.id, body, requestId);
    revalidateTag(consultationUserBookingsTag(session.user.id));
    revalidateTag(consultationTrainerBookingsTag(result.booking.cynologistUserId));
    const status = result.kind === "created" ? 201 : 200;
    return NextResponse.json({ success: true, data: result }, { status });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    const mapped = mapConsultationError(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const zod = mapZodError(error);
    if (zod) {
      return NextResponse.json(zod.body, { status: zod.status });
    }
    logConsultationRouteError(logger, "POST book", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
