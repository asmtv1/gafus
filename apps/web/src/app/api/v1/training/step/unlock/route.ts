import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  SubscriptionOrCreditsRequiredError,
  RewardedCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { unlockCourseStepRewardedTarget } from "@gafus/core/services/training";
import { AuthorizationError } from "@gafus/core/errors";
import { dayOnCourseIdSchema, trainingTypeSchema } from "@shared/lib/validation/schemas";

const unlockStepSchema = z.object({
  courseType: trainingTypeSchema,
  dayOnCourseId: dayOnCourseIdSchema,
  stepIndex: z.number().int().min(0),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthorizationError("Не авторизован");
    }

    const body = unlockStepSchema.parse(await request.json());
    const result = await unlockCourseStepRewardedTarget({
      userId: session.user.id,
      platform: "WEB_DESKTOP",
      courseType: body.courseType,
      dayOnCourseId: body.dayOnCourseId,
      stepIndex: body.stepIndex,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    if (
      error instanceof SubscriptionOrCreditsRequiredError ||
      error instanceof RewardedCreditsRequiredError
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Ошибка валидации", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
});
