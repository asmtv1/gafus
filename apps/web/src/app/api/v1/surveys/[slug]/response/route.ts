import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import { AuthorizationError } from "@gafus/core/errors";
import { submitSurveyResponse } from "@gafus/core/services/survey";
import {
  requirePremiumOrRewardedAccessForUserStep,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-survey-response");

const paramsSchema = z.object({
  slug: z.string().min(1),
});

const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.null(),
]);

const submitSchema = z.object({
  courseId: z.string().min(1),
  stepId: z.string().min(1),
  userStepId: z.string().min(1),
  petId: z.string().min(1).nullable().optional(),
  answers: z.record(z.string(), answerValueSchema),
});

export const POST = withCSRFProtection(
  async (request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new AuthorizationError("Не авторизован");
      }

      const params = paramsSchema.parse(await context.params);
      const body = submitSchema.parse(await request.json());
      await requirePremiumOrRewardedAccessForUserStep({
        userId: session.user.id,
        platform: "WEB_DESKTOP",
        userStepId: body.userStepId,
      });
      const result = await submitSurveyResponse(session.user.id, {
        ...body,
        surveySlug: params.slug,
      });

      if (!result.success) {
        const status = result.code === "SURVEY_EDIT_WINDOW_EXPIRED" ? 423 : 400;
        return NextResponse.json(result, { status });
      }

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message, code: "UNAUTHORIZED" },
          { status: 401 },
        );
      }
      if (error instanceof SubscriptionOrCreditsRequiredError) {
        return NextResponse.json(
          { success: false, error: error.message, code: error.code },
          { status: 402 },
        );
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { success: false, error: error.errors[0]?.message ?? "Ошибка валидации", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      logger.error("Failed to submit survey", error as Error);
      return NextResponse.json(
        { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
        { status: 500 },
      );
    }
  },
);
