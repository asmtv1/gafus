/**
 * Training Routes
 * Endpoints для работы с тренировками
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getTrainingDays,
  getTrainingDayWithUserSteps,
} from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-training");

export const trainingRoutes = new Hono();

// ==================== GET /training/days ====================
// Получить дни тренировок курса
const daysQuerySchema = z.object({
  type: z.string().optional(),
});

trainingRoutes.get("/days", zValidator("query", daysQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { type } = c.req.valid("query");

    const result = await getTrainingDays(user.id, type);
    return c.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
    }
    logger.error("Error fetching training days", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /training/day ====================
// Получить день с шагами пользователя
const dayQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  dayOnCourseId: z.string().uuid("dayOnCourseId должен быть UUID"),
  createIfMissing: z.enum(["true", "false"]).optional().transform(v => v === "true"),
});

trainingRoutes.get("/day", zValidator("query", dayQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType, dayOnCourseId, createIfMissing } = c.req.valid("query");

    const result = await getTrainingDayWithUserSteps(
      user.id,
      courseType,
      dayOnCourseId,
      { createIfMissing }
    );

    if (!result) {
      return c.json({ success: false, error: "День тренировки не найден", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error fetching training day", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
