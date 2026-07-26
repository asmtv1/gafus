import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createRewardedAdSession,
  getRewardedCreditsStatus,
  grantRewardedCredits,
  recordRewardedAdEvent,
  REWARDED_CONSULTATION_BOOKING_COST,
  RewardedAdSessionError,
  RewardedAdsDisabledError,
  RewardedBalanceFullError,
  RewardedDailyLimitReachedError,
  type RewardedTargetInput,
} from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";
import { getClientAppContext } from "../../lib/client-app-context.js";

const logger = createWebLogger("api-rewarded-ads");
export const rewardedAdsRoutes = new Hono();

const mobilePlatformSchema = z.enum(["ANDROID", "IOS"]);
const targetTypeSchema = z.enum([
  "ARTICLE",
  "COURSE_STEP",
  "DAILY_COURSE_STEP",
  "CONSULTATION_BOOKING",
]);

const statusQuerySchema = z.object({
  platform: mobilePlatformSchema,
  targetType: targetTypeSchema.optional(),
  targetId: z.string().min(1).optional(),
});

const sessionSchema = z.object({
  platform: mobilePlatformSchema,
  targetType: targetTypeSchema.optional(),
  targetId: z.string().min(1).optional(),
});

const eventSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(["LOADED", "SHOWN", "DISMISSED", "FAILED", "REWARDED"]),
  payload: z.unknown().optional(),
});

const grantSchema = z.object({
  sessionId: z.string().min(1),
  requestNonce: z.string().min(1),
  providerPayload: z.unknown().optional(),
});

function setNoStore(c: Context): void {
  c.header("Cache-Control", "private, no-store");
}

function targetFrom(input: {
  targetType?: RewardedTargetInput["targetType"];
  targetId?: string;
}): RewardedTargetInput | undefined {
  if (!input.targetType || !input.targetId) {
    return undefined;
  }
  if (input.targetType === "CONSULTATION_BOOKING") {
    return {
      targetType: input.targetType,
      targetId: input.targetId,
      cost: REWARDED_CONSULTATION_BOOKING_COST,
    };
  }
  return { targetType: input.targetType, targetId: input.targetId };
}

function errorStatus(error: unknown): 400 | 402 | 404 | 409 | 500 {
  if (error instanceof RewardedBalanceFullError) return 409;
  if (error instanceof RewardedDailyLimitReachedError) return 402;
  if (error instanceof RewardedAdsDisabledError) return 402;
  if (error instanceof RewardedAdSessionError) {
    if (error.code === "REWARDED_SESSION_NOT_FOUND") return 404;
    if (error.code === "REWARDED_SESSION_ALREADY_GRANTED") return 409;
    return 400;
  }
  return 500;
}

function errorCode(error: unknown): string {
  if (
    error instanceof RewardedAdSessionError ||
    error instanceof RewardedAdsDisabledError ||
    error instanceof RewardedBalanceFullError ||
    error instanceof RewardedDailyLimitReachedError
  ) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

function jsonError(c: Context, error: unknown) {
  const status = errorStatus(error);
  if (status === 500) {
    logger.error("rewarded ads route error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка", code: "INTERNAL_ERROR" }, 500);
  }
  return c.json(
    {
      success: false,
      error: error instanceof Error ? error.message : "Rewarded ads error",
      code: errorCode(error),
    },
    status,
  );
}

rewardedAdsRoutes.get("/status", zValidator("query", statusQuerySchema), async (c) => {
  setNoStore(c);
  try {
    const user = c.get("user");
    const query = c.req.valid("query");
    const data = await getRewardedCreditsStatus({
      userId: user.id,
      platform: query.platform,
      target: targetFrom(query),
      clientContext: getClientAppContext(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return jsonError(c, error);
  }
});

rewardedAdsRoutes.post("/session", zValidator("json", sessionSchema), async (c) => {
  setNoStore(c);
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await createRewardedAdSession({
      userId: user.id,
      platform: body.platform,
      target: targetFrom(body),
      clientContext: getClientAppContext(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return jsonError(c, error);
  }
});

rewardedAdsRoutes.post("/events", zValidator("json", eventSchema), async (c) => {
  setNoStore(c);
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    await recordRewardedAdEvent({
      userId: user.id,
      sessionId: body.sessionId,
      eventType: body.eventType,
      payload: body.payload,
    });
    return c.json({ success: true, data: { recorded: true } });
  } catch (error) {
    return jsonError(c, error);
  }
});

rewardedAdsRoutes.post("/grant", zValidator("json", grantSchema), async (c) => {
  setNoStore(c);
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await grantRewardedCredits({
      userId: user.id,
      sessionId: body.sessionId,
      requestNonce: body.requestNonce,
      providerPayload: body.providerPayload,
    });
    return c.json({ success: true, data });
  } catch (error) {
    return jsonError(c, error);
  }
});
