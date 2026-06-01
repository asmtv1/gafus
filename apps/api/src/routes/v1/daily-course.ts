/**
 * Daily Course Routes
 * Endpoints для курса дня.
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getDailyCourseDayWithMonetizedSteps,
  getTodayDailyCourse,
  requireDailyCourseStepPremiumOrRewardedUnlock,
  unlockDailyCourseStepRewardedTarget,
  updateDailyCourseStepAndDay,
} from "@gafus/core/services/dailyCourse";
import { SubscriptionOrCreditsRequiredError } from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-daily-course");

export const dailyCourseRoutes = new Hono();

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

const rewardedPlatformSchema = z.enum(["ANDROID", "IOS"]);

const scheduleQuerySchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
  platform: rewardedPlatformSchema.optional(),
  createIfMissing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

const stepActionSchema = z.object({
  scheduleId: z.string().min(1, "scheduleId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  platform: rewardedPlatformSchema.optional(),
});

const startStepSchema = stepActionSchema.extend({
  status: z.literal("IN_PROGRESS").optional(),
  durationSec: z.number().int().min(0, "durationSec >= 0"),
});

const pauseStepSchema = stepActionSchema.extend({
  timeLeftSec: z.number().int().min(0, "timeLeftSec >= 0"),
});

function mapDailyCourseError(error: unknown): { status: 400 | 403 | 404 | 409 | 500; body: object } {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "SubscriptionOrCreditsRequiredError" || message === "SUBSCRIPTION_OR_CREDITS_REQUIRED") {
    return {
      status: 403,
      body: { success: false, error: "Для действия нужна подписка или rewarded credits", code: "SUBSCRIPTION_OR_CREDITS_REQUIRED" },
    };
  }
  if (message === "SCHEDULE_NOT_FOUND") {
    return { status: 404, body: { success: false, error: "Курс дня не найден", code: "NOT_FOUND" } };
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

function isSubscriptionOrCreditsRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionOrCreditsRequiredError ||
    (error instanceof Error && error.name === "SubscriptionOrCreditsRequiredError")
  );
}

function getRewardedPlatform(c: Context, platform?: string): "ANDROID" | "IOS" {
  const candidate =
    platform ?? c.req.query("platform") ?? c.req.header("x-rewarded-platform") ?? c.req.header("x-platform");
  const parsed = rewardedPlatformSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "ANDROID";
}

function subscriptionOrCreditsResponse(c: Context): Response {
  return c.json(
    {
      success: false,
      error: "Для действия нужна подписка или rewarded credits",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    },
    402,
    noStoreHeaders,
  );
}

async function requireRewardedDailyStepAccess(
  c: Context,
  input: { scheduleId: string; stepIndex: number; platform?: string },
): Promise<Response | null> {
  const user = c.get("user");
  try {
    await requireDailyCourseStepPremiumOrRewardedUnlock({
      userId: user.id,
      platform: getRewardedPlatform(c, input.platform),
      scheduleId: input.scheduleId,
      stepIndex: input.stepIndex,
    });
    return null;
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    throw error;
  }
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
    const { scheduleId, createIfMissing, platform } = c.req.valid("query");
    const result = await getDailyCourseDayWithMonetizedSteps(user.id, scheduleId, {
      createIfMissing,
      platform: getRewardedPlatform(c, platform),
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

dailyCourseRoutes.post("/step/unlock", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, platform } = c.req.valid("json");
    const result = await unlockDailyCourseStepRewardedTarget({
      userId: user.id,
      platform: getRewardedPlatform(c, platform),
      scheduleId,
      stepIndex,
    });
    return c.json({ success: true, data: result }, 200, noStoreHeaders);
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error unlocking daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status, noStoreHeaders);
  }
});

dailyCourseRoutes.post("/step/start", zValidator("json", startStepSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, durationSec, platform } = c.req.valid("json");
    const accessResponse = await requireRewardedDailyStepAccess(c, {
      scheduleId,
      stepIndex,
      platform,
    });
    if (accessResponse) return accessResponse;
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, {
      type: "start",
      remainingSec: durationSec,
    });
    return c.json({ success: true });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error starting daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/pause", zValidator("json", pauseStepSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, timeLeftSec, platform } = c.req.valid("json");
    const accessResponse = await requireRewardedDailyStepAccess(c, {
      scheduleId,
      stepIndex,
      platform,
    });
    if (accessResponse) return accessResponse;
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, {
      type: "pause",
      remainingSec: timeLeftSec,
    });
    return c.json({ success: true });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error pausing daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/resume", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, platform } = c.req.valid("json");
    const accessResponse = await requireRewardedDailyStepAccess(c, {
      scheduleId,
      stepIndex,
      platform,
    });
    if (accessResponse) return accessResponse;
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "resume" });
    return c.json({ success: true });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error resuming daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/reset", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, platform } = c.req.valid("json");
    const accessResponse = await requireRewardedDailyStepAccess(c, {
      scheduleId,
      stepIndex,
      platform,
    });
    if (accessResponse) return accessResponse;
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "reset" });
    return c.json({ success: true });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error resetting daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});

dailyCourseRoutes.post("/step/complete", zValidator("json", stepActionSchema), async (c) => {
  try {
    const user = c.get("user");
    const { scheduleId, stepIndex, platform } = c.req.valid("json");
    const accessResponse = await requireRewardedDailyStepAccess(c, {
      scheduleId,
      stepIndex,
      platform,
    });
    if (accessResponse) return accessResponse;
    await updateDailyCourseStepAndDay(user.id, scheduleId, stepIndex, { type: "complete" });
    return c.json({ success: true });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error completing daily course step", error as Error);
    const mapped = mapDailyCourseError(error);
    return c.json(mapped.body, mapped.status);
  }
});
