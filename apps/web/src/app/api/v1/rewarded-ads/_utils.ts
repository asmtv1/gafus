import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@gafus/auth";
import {
  RewardedAdSessionError,
  RewardedAdsDisabledError,
  RewardedBalanceFullError,
  RewardedDailyLimitReachedError,
  type RewardedTargetInput,
} from "@gafus/core/services/rewardedCredits";

export const webPlatformSchema = z.enum(["WEB_DESKTOP", "WEB_TOUCH"]);
export const rewardedTargetTypeSchema = z.enum([
  "ARTICLE",
  "COURSE_STEP",
  "DAILY_COURSE_STEP",
  "CONSULTATION_BOOKING",
]);

export function targetFrom(input: {
  targetType?: RewardedTargetInput["targetType"];
  targetId?: string;
}): RewardedTargetInput | undefined {
  if (!input.targetType || !input.targetId) {
    return undefined;
  }
  return { targetType: input.targetType, targetId: input.targetId };
}

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function unauthorizedJson() {
  return noStoreJson(
    { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}

export async function readJson(request: NextRequest | Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
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

export function rewardedErrorJson(error: unknown) {
  const status = errorStatus(error);
  return noStoreJson(
    {
      success: false,
      error: error instanceof Error && status !== 500 ? error.message : "Внутренняя ошибка",
      code: errorCode(error),
    },
    { status },
  );
}
