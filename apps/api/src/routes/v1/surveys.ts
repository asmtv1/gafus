import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getSurveyComparison,
  getSurveyResponse,
  getSurveyTemplate,
  submitSurveyResponse,
} from "@gafus/core/services/survey";
import {
  requirePremiumOrRewardedAccessForUserStep,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-surveys");

export const surveysRoutes = new Hono();

const rewardedPlatformSchema = z.enum(["ANDROID", "IOS"]);

function getRewardedPlatform(c: {
  req: { query(name: string): string | undefined; header(name: string): string | undefined };
}): "ANDROID" | "IOS" {
  const candidate =
    c.req.query("platform") ?? c.req.header("x-rewarded-platform") ?? c.req.header("x-platform");
  const parsed = rewardedPlatformSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "ANDROID";
}

function isSubscriptionOrCreditsRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionOrCreditsRequiredError ||
    (error instanceof Error && error.name === "SubscriptionOrCreditsRequiredError")
  );
}

function subscriptionOrCreditsResponse(c: {
  json: (body: unknown, status: 402) => Response;
}): Response {
  return c.json(
    {
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    },
    402,
  );
}

const slugParamSchema = z.object({
  slug: z.string().min(1),
});

const getSurveyQuerySchema = z.object({
  stepId: z.string().min(1).optional(),
});

const answerValueSchema = z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]);

const submitSurveySchema = z.object({
  courseId: z.string().min(1),
  stepId: z.string().min(1),
  userStepId: z.string().min(1),
  petId: z.string().min(1).nullable().optional(),
  answers: z.record(z.string(), answerValueSchema),
});

const comparisonQuerySchema = z.object({
  courseId: z.string().min(1),
  familySlug: z.string().min(1),
});

surveysRoutes.get("/comparison", zValidator("query", comparisonQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const query = c.req.valid("query");
    const comparison = await getSurveyComparison(user.id, query.courseId, query.familySlug);
    return c.json({ success: true, data: comparison });
  } catch (error) {
    logger.error("Error getting survey comparison", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

surveysRoutes.get(
  "/:slug",
  zValidator("param", slugParamSchema),
  zValidator("query", getSurveyQuerySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { slug } = c.req.valid("param");
      const { stepId } = c.req.valid("query");
      const template = getSurveyTemplate(slug);
      if (!template) {
        return c.json(
          { success: false, error: "Анкета не найдена", code: "SURVEY_NOT_FOUND" },
          400,
        );
      }
      const response = stepId ? await getSurveyResponse(user.id, stepId) : null;
      return c.json({ success: true, data: { template, response } });
    } catch (error) {
      logger.error("Error getting survey", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

surveysRoutes.post(
  "/:slug/response",
  zValidator("param", slugParamSchema),
  zValidator("json", submitSurveySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { slug } = c.req.valid("param");
      const body = c.req.valid("json");
      await requirePremiumOrRewardedAccessForUserStep({
        userId: user.id,
        platform: getRewardedPlatform(c),
        userStepId: body.userStepId,
      });
      const result = await submitSurveyResponse(user.id, { ...body, surveySlug: slug });
      if (!result.success) {
        return c.json(result, result.code === "SURVEY_EDIT_WINDOW_EXPIRED" ? 423 : 400);
      }
      return c.json(result);
    } catch (error) {
      if (isSubscriptionOrCreditsRequiredError(error)) {
        return subscriptionOrCreditsResponse(c);
      }
      logger.error("Error submitting survey", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);
