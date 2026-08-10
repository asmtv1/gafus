import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createRewardedAdSession,
  getRewardedAdStatus,
  grantRewardedTargetAccess,
  recordRewardedAdEvent,
  RewardedAdSessionError,
  RewardedAdsDisabledError,
  type RewardedAccessTarget,
} from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";
import { getClientAppContext } from "../../lib/client-app-context.js";

const logger = createWebLogger("api-rewarded-ads");
export const rewardedAdsRoutes = new Hono();
const MINIMUM_DIRECT_ACCESS_VERSION = "1.6.5";

const mobilePlatformSchema = z.enum(["ANDROID", "IOS"]);
const targetTypeSchema = z.enum(["ARTICLE", "COURSE_STEP"]);

const statusQuerySchema = z.object({
  platform: mobilePlatformSchema,
  targetType: targetTypeSchema,
  targetId: z.string().min(1),
});

const sessionSchema = z.object({
  platform: mobilePlatformSchema,
  targetType: targetTypeSchema,
  targetId: z.string().min(1),
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

function targetFrom(input: RewardedAccessTarget): RewardedAccessTarget {
  return { targetType: input.targetType, targetId: input.targetId };
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return (actualParts[index] ?? 0) > (minimumParts[index] ?? 0);
    }
  }
  return true;
}

function requireSupportedMobileClient(c: Context, requestedPlatform?: "ANDROID" | "IOS") {
  const clientContext = getClientAppContext(c);
  const expectedPlatform = requestedPlatform?.toLowerCase();
  if (
    (clientContext.platform !== "android" && clientContext.platform !== "ios") ||
    (expectedPlatform && clientContext.platform !== expectedPlatform)
  ) {
    return {
      error: c.json(
        {
          success: false,
          error: "Rewarded-реклама доступна только в мобильном приложении",
          code: "MOBILE_CLIENT_REQUIRED",
        },
        400,
      ),
      clientContext,
    };
  }
  if (
    !clientContext.version ||
    !versionAtLeast(clientContext.version, MINIMUM_DIRECT_ACCESS_VERSION)
  ) {
    return {
      error: c.json(
        {
          success: false,
          error: "Обновите приложение, чтобы открыть материал за рекламу",
          code: "APP_UPDATE_REQUIRED",
        },
        426,
      ),
      clientContext,
    };
  }
  return { error: null, clientContext };
}

function errorStatus(error: unknown): 400 | 402 | 404 | 409 | 500 {
  if (error instanceof RewardedAdsDisabledError) return 402;
  if (error instanceof RewardedAdSessionError) {
    if (error.code === "REWARDED_SESSION_NOT_FOUND" || error.code === "REWARDED_TARGET_NOT_FOUND")
      return 404;
    if (error.code === "REWARDED_SESSION_ALREADY_GRANTED" || error.code === "TARGET_ALREADY_ACTIVE")
      return 409;
    return 400;
  }
  return 500;
}

function errorCode(error: unknown): string {
  if (error instanceof RewardedAdSessionError || error instanceof RewardedAdsDisabledError) {
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
    const mobileClient = requireSupportedMobileClient(c, query.platform);
    if (mobileClient.error) return mobileClient.error;
    const data = await getRewardedAdStatus({
      userId: user.id,
      platform: query.platform,
      target: targetFrom(query),
      clientContext: mobileClient.clientContext,
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
    const mobileClient = requireSupportedMobileClient(c, body.platform);
    if (mobileClient.error) return mobileClient.error;
    const data = await createRewardedAdSession({
      userId: user.id,
      platform: body.platform,
      target: targetFrom(body),
      clientContext: mobileClient.clientContext,
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
    const mobileClient = requireSupportedMobileClient(c);
    if (mobileClient.error) return mobileClient.error;
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
    const mobileClient = requireSupportedMobileClient(c);
    if (mobileClient.error) return mobileClient.error;
    const data = await grantRewardedTargetAccess({
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
