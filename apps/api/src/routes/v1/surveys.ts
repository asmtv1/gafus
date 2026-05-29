import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getSurveyComparison,
  getSurveyResponse,
  getSurveyTemplate,
  submitSurveyResponse,
} from "@gafus/core/services/survey";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-surveys");

export const surveysRoutes = new Hono();

const slugParamSchema = z.object({
  slug: z.string().min(1),
});

const getSurveyQuerySchema = z.object({
  stepId: z.string().min(1).optional(),
});

const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.null(),
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

surveysRoutes.get(
  "/comparison",
  zValidator("query", comparisonQuerySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const query = c.req.valid("query");
      const comparison = await getSurveyComparison(user.id, query.courseId, query.familySlug);
      return c.json({ success: true, data: comparison });
    } catch (error) {
      logger.error("Error getting survey comparison", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

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
      const result = await submitSurveyResponse(user.id, { ...body, surveySlug: slug });
      if (!result.success) {
        return c.json(result, result.code === "SURVEY_EDIT_WINDOW_EXPIRED" ? 423 : 400);
      }
      return c.json(result);
    } catch (error) {
      logger.error("Error submitting survey", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);
