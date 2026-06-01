/**
 * POST /api/v1/consultations/book
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { bookSlotInputSchema, bookSlotWithPremiumOrRewardedCredits } from "@gafus/core";
import { createWebLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";
import {
  RewardedCreditsRequiredError,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";

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
    const json = await request.json();
    const body = bookSlotInputSchema.parse(json);
    const requestId = request.headers.get("x-request-id") ?? undefined;
    const result = await bookSlotWithPremiumOrRewardedCredits({
      userId: session.user.id,
      platform: "WEB_DESKTOP",
      body,
      requestId,
    });
    revalidateTag(consultationUserBookingsTag(session.user.id));
    revalidateTag(consultationTrainerBookingsTag(result.booking.cynologistUserId));
    const status = result.kind === "created" ? 201 : 200;
    return NextResponse.json({ success: true, data: result }, { status });
  } catch (error) {
    if (
      error instanceof RewardedCreditsRequiredError ||
      error instanceof SubscriptionOrCreditsRequiredError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Для действия нужна подписка или rewarded credits",
          code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        },
        { status: 402 },
      );
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
