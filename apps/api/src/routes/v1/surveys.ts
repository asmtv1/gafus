import { Hono, type TypedResponse } from "hono";
import { bodyLimit } from "hono/body-limit";
import type {
  SurveyBySlugRead,
  SurveyComparisonRead,
} from "../../../../../packages/types/src/data/survey";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";

import {
  requirePremiumOrRewardedAccessForUserStep,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { readSurveysApplication } from "../../modules/surveys/composition/read-surveys.js";
import { writeSurveyResponseApplication } from "../../modules/surveys/composition/write-response.js";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-surveys");

export const surveysRoutes = new Hono();

// Survey responses and comparison results contain private user/pet data.
// Set headers before validation and keep every outcome uncacheable.
surveysRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
  c.header("Cache-Control", "private, no-store");
});

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

const answerValueSchema = z.union([
  z.string().max(32 * 1024),
  z.array(z.string().max(2048)).max(100),
  z.boolean(), z.null(),
]);

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
    const comparison = await readSurveysApplication.getComparison(
      user.id, query.courseId, query.familySlug,
    );
    return c.json({ success: true, data: comparison }) satisfies Response &
      TypedResponse<SurveyComparisonRead>;
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
      const template = readSurveysApplication.getTemplate(slug);
      if (!template) {
        return c.json(
          { success: false, error: "Анкета не найдена", code: "SURVEY_NOT_FOUND" },
          400,
        );
      }
      const response = stepId ? await readSurveysApplication.getResponse(user.id, stepId) : null;
      return c.json({ success: true, data: { template, response } }) satisfies Response &
        TypedResponse<SurveyBySlugRead>;
    } catch (error) {
      logger.error("Error getting survey", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

surveysRoutes.post(
  "/:slug/response",
  // Zod 3 remains required by shared schemas. Reject oversized collections
  // before JSON parsing, avoiding quadratic/recursive validation pressure.
  bodyLimit({
    maxSize: 128 * 1024,
    onError: c => c.json({ success: false, error: "Слишком большой ответ" }, 413),
  }),
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
      const result = await writeSurveyResponseApplication.execute(user.id, {
        ...body, surveySlug: slug,
      });
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
