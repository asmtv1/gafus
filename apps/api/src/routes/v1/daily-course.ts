/**
 * Daily Course Routes
 * Endpoints для курса дня.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getDailyCourseDayWithUserSteps,
  getTodayDailyCourse,
  updateDailyCourseStepAndDay,
} from "@gafus/core/services/dailyCourse";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-daily-course");

export const dailyCourseRoutes = new Hono();

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

const scheduleQuerySchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
  createIfMissing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

const stepActionSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
});

const startStepSchema = stepActionSchema.extend({
  status: z.literal("IN_PROGRESS").optional(),
  durationSec: z.number().int().min(0, "durationSec >= 0"),
});

const pauseStepSchema = stepActionSchema.extend({
  timeLeftSec: z.number().int().min(0, "timeLeftSec >= 0"),
});

function mapDailyCourseError(error: unknown): {
  status: 400 | 404 | 409 | 500;
  body: object;
} {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "SCHEDULE_NOT_FOUND") {
    return {
      status: 404,
      body: { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
    };
  }
  if (message === "STEP_NOT_FOUND") {
    return { status: 404, body: { success: false, error: "Шаг не найден", code: "NOT_FOUND" } };
  }
  if (message.startsWith("INVALID_STATE")) {
    return {
      status: 409,
      body: { success: false, error: "Недопустимое состояние шага", code: "INVALID_STATE" },
    };
  }
  if (message === "INVALID_TIMER") {
    return {
      status: 400,
      body: { success: false, error: "Недопустимое значение таймера", code: "INVALID_TIMER" },
    };
  }
  return {
    status: 500,
    body: { success: false, error: "Внутренняя ошибка сервера" },
  };
}

dailyCourseRoutes.get("/today", async (c) => {
  try {
    const user = c.get("user");
    const result = await getTodayDailyCourse(user.id);
    return c.json({ success: true, data: result }, 200, noStoreHeaders);
  } catch (error) {
    logger.error("Error fetching today daily course", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status, noStoreHeaders);
  }
});

dailyCourseRoutes.get("/day", zValidator("query", scheduleQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, createIfMissing } = c.req.valid("query");
    const result = await getDailyCourseDayWithUserSteps(user.id, scheduleId, {
      createIfMissing,
    });
    if (!result) {
      return c.json(
        { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
        404,
        noStoreHeaders,
      );
    }
    return c.json({ success: true, data: result }, 200, noStoreHeaders);
  } catch (error) {
    logger.error("Error fetching daily course day", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status, noStoreHeaders);
  }
});

dailyCourseRoutes.post("/step/start", zValidator("json", startStepSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, durationSec } = c.req.valid("json");
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, {
      type: "start",
      remainingSec: durationSec,
    });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error starting daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/pause", zValidator("json", pauseStepSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, timeLeftSec } = c.req.valid("json");
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, {
      type: "pause",
      remainingSec: timeLeftSec,
    });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error pausing daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/resume", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex } = c.req.valid("json");
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "resume" });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error resuming daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/reset", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex } = c.req.valid("json");
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "reset" });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error resetting daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/complete", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex } = c.req.valid("json");
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "complete" });
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error completing daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});
