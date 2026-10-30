/**
 * Daily Course Routes
 * Endpoints для курса дня.
 */
import { Hono, type TypedResponse } from "hono";
import type {
  TodayDailyCourseRead,
  DailyCourseDayRead,
  DailyCourseBoundDayRead,
} from "../../../../../packages/types/src/data/training";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { createWebLogger } from "@gafus/logger";
import { isTrustedBrowserOrigin } from "../../lib/browser-auth.js";
import { readTodayDailyCourseApplication } from "../../modules/learner-daily/composition/read-today-daily-course.js";
import { dayAndStepCommandsApplication } from "../../modules/learner-daily/composition/day-and-step-commands.js";

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
    .transform((v) => v === "true"),
});

const stepActionSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  expectedBundleStepId: z.string().min(1).max(128).optional(),
  expectedStepId: z.string().min(1).max(128).optional(),
});

type DailyStepBindingFields = { expectedBundleStepId?: string; expectedStepId?: string };
function parseDailyStepBinding(
  fields: DailyStepBindingFields,
  requiredForWeb: boolean,
): { expectedBundleStepId: string; expectedStepId: string } | "INVALID" | undefined {
  if (fields.expectedBundleStepId === undefined && fields.expectedStepId === undefined)
    return requiredForWeb ? "INVALID" : undefined;
  if (!fields.expectedBundleStepId || !fields.expectedStepId) return "INVALID";
  return {
    expectedBundleStepId: fields.expectedBundleStepId,
    expectedStepId: fields.expectedStepId,
  };
}

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
  if (message === "STALE_DAILY_STEP_BINDING") {
    return {
      status: 409,
      body: { success: false, error: "Состав курса дня изменился", code: "STALE_STEP_BINDING" },
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
    const result = await readTodayDailyCourseApplication.execute(user.id);
    return c.json({ success: true, data: result }, 200, noStoreHeaders) satisfies Response &
      TypedResponse<TodayDailyCourseRead>;
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
    // This legacy opt-in GET is a WRITE. Cookie transport must pass the same
    // trusted-Origin gate as POST mutations, while explicit Bearer stays compatible.
    if (createIfMissing && !c.req.header("Authorization") && !isTrustedBrowserOrigin(c)) {
      return c.json({ success: false, error: "Недоверенный Origin" }, 403, noStoreHeaders);
    }
    const result = await dayAndStepCommandsApplication.getDay(user.id, scheduleId, {
      createIfMissing,
    });
    if (!result) {
      return c.json(
        { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
        404,
        noStoreHeaders,
      );
    }
    const optedIn = c.req.header("X-Gafus-Web-Daily-Binding") === "1";
    // Legacy/native wire is unchanged, including its positional stepIndex.
    const { serverNow: _serverNow, ...legacyResult } = result;
    const data = optedIn
      ? { ...result, onlineStepBinding: "BUNDLE_STEP_ID_V1" as const }
      : {
          ...legacyResult,
          steps: result.steps.map(
            ({ bundleStepId: _bindingId, timerSnapshot: _timer, ...step }) => step,
          ),
        };
    return c.json({ success: true, data }, 200, noStoreHeaders) satisfies Response &
      TypedResponse<DailyCourseDayRead | DailyCourseBoundDayRead>;
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
    const binding = parseDailyStepBinding(
      c.req.valid("json"),
      c.req.header("X-Gafus-Web-Daily-Binding") === "1",
    );
    if (binding === "INVALID") return c.json({ success: false, code: "INVALID_STEP_BINDING" }, 400);
    await dayAndStepCommandsApplication.updateStep(
      user.id,
      scheduleId,
      stepIndex,
      {
        type: "start",
        remainingSec: durationSec,
      },
      binding,
    );
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
    const binding = parseDailyStepBinding(
      c.req.valid("json"),
      c.req.header("X-Gafus-Web-Daily-Binding") === "1",
    );
    if (binding === "INVALID") return c.json({ success: false, code: "INVALID_STEP_BINDING" }, 400);
    await dayAndStepCommandsApplication.updateStep(
      user.id,
      scheduleId,
      stepIndex,
      {
        type: "pause",
        remainingSec: timeLeftSec,
      },
      binding,
    );
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
    const binding = parseDailyStepBinding(
      c.req.valid("json"),
      c.req.header("X-Gafus-Web-Daily-Binding") === "1",
    );
    if (binding === "INVALID") return c.json({ success: false, code: "INVALID_STEP_BINDING" }, 400);
    await dayAndStepCommandsApplication.updateStep(
      user.id,
      scheduleId,
      stepIndex,
      { type: "resume" },
      binding,
    );
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
    const binding = parseDailyStepBinding(
      c.req.valid("json"),
      c.req.header("X-Gafus-Web-Daily-Binding") === "1",
    );
    if (binding === "INVALID") return c.json({ success: false, code: "INVALID_STEP_BINDING" }, 400);
    await dayAndStepCommandsApplication.updateStep(
      user.id,
      scheduleId,
      stepIndex,
      { type: "reset" },
      binding,
    );
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
    const binding = parseDailyStepBinding(
      c.req.valid("json"),
      c.req.header("X-Gafus-Web-Daily-Binding") === "1",
    );
    if (binding === "INVALID") return c.json({ success: false, code: "INVALID_STEP_BINDING" }, 400);
    await dayAndStepCommandsApplication.updateStep(
      user.id,
      scheduleId,
      stepIndex,
      { type: "complete" },
      binding,
    );
    return c.json({ success: true });
  } catch (error) {
    logger.error("Error completing daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});
