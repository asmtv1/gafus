import { createHash, randomBytes } from "node:crypto";

import {
  prisma,
  type Prisma,
  type RewardedAdSessionStatus,
} from "@gafus/prisma";

import { REWARDED_AD_SESSION_TTL_MINUTES } from "./constants";
import { RewardedAdSessionError, RewardedAdsDisabledError } from "./errors";
import { resolveRewardedPlatformSettings } from "./settingsService";
import type { ClientAppContext } from "../appFeatureFlags";
import type {
  RewardedAdLifecycleEvent,
  RewardedAdSessionDto,
  RewardedPlatform,
  RewardedTargetInput,
} from "./types";
import { getRewardedCreditsStatus, grantRewardedCreditsToWallet } from "./walletService";

const ACTIVE_SESSION_STATUSES = ["CREATED", "LOADED", "SHOWN", "REWARDED"] as const;
const STATUS_ORDER: Record<string, number> = {
  CREATED: 0,
  LOADED: 1,
  SHOWN: 2,
  REWARDED: 3,
  GRANTED: 4,
  DISMISSED: 4,
  FAILED: 4,
  EXPIRED: 4,
};

function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

function mapEventToStatus(eventType: RewardedAdLifecycleEvent): RewardedAdSessionStatus {
  return eventType;
}

function shouldMoveStatusForward(currentStatus: string, nextStatus: string): boolean {
  return (STATUS_ORDER[nextStatus] ?? 0) >= (STATUS_ORDER[currentStatus] ?? 0);
}

function assertValidLifecycleTransition(
  currentStatus: string,
  eventType: RewardedAdLifecycleEvent,
): void {
  if (eventType === "REWARDED" && currentStatus !== "SHOWN") {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_INVALID_TRANSITION",
      "Rewarded ad session must be shown before it can be rewarded",
    );
  }
}

export async function createRewardedAdSession(input: {
  userId: string;
  platform: RewardedPlatform;
  target?: RewardedTargetInput;
  clientContext?: ClientAppContext;
  now?: Date;
}): Promise<RewardedAdSessionDto> {
  const now = input.now ?? new Date();
  const platformSettings = await resolveRewardedPlatformSettings(
    input.platform,
    input.clientContext,
  );
  if (!platformSettings.platformEnabled) {
    throw new RewardedAdsDisabledError();
  }

  const status = await getRewardedCreditsStatus({
    userId: input.userId,
    platform: input.platform,
    target: input.target,
    clientContext: input.clientContext,
    now,
  });
  if (!status.canWatchAd) {
    throw new RewardedAdsDisabledError(status.canWatchAdReason);
  }

  const existing = await prisma.rewardedAdSession.findFirst({
    where: {
      userId: input.userId,
      platform: input.platform,
      status: { in: [...ACTIVE_SESSION_STATUSES] },
      expiresAt: { gt: now },
      targetType: input.target?.targetType,
      targetId: input.target?.targetId,
    },
  });
  if (existing) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_ALREADY_GRANTED",
      "У пользователя уже есть активная rewarded ad session",
    );
  }

  const requestNonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + REWARDED_AD_SESSION_TTL_MINUTES * 60 * 1000);
  const session = await prisma.rewardedAdSession.create({
    data: {
      userId: input.userId,
      platform: input.platform,
      provider: "YANDEX",
      placementId: platformSettings.placementId,
      requestNonceHash: hashNonce(requestNonce),
      expiresAt,
      targetType: input.target?.targetType,
      targetId: input.target?.targetId,
    },
  });

  return {
    sessionId: session.id,
    requestNonce,
    provider: session.provider,
    placementId: session.placementId,
    platform: session.platform,
    expiresAt: session.expiresAt.toISOString(),
    testMode: platformSettings.testMode,
  };
}

export async function recordRewardedAdEvent(input: {
  userId: string;
  sessionId: string;
  eventType: RewardedAdLifecycleEvent;
  payload?: unknown;
}): Promise<void> {
  const session = await prisma.rewardedAdSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session || session.userId !== input.userId) {
    throw new RewardedAdSessionError("REWARDED_SESSION_NOT_FOUND", "Rewarded ad session not found");
  }
  assertValidLifecycleTransition(session.status, input.eventType);

  await prisma.rewardedAdEvent.create({
    data: {
      sessionId: input.sessionId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });

  const nextStatus = mapEventToStatus(input.eventType);
  if (shouldMoveStatusForward(session.status, nextStatus)) {
    await prisma.rewardedAdSession.update({
      where: { id: input.sessionId },
      data: {
        status: nextStatus,
        rewardedAt: input.eventType === "REWARDED" ? new Date() : undefined,
        errorCode: input.eventType === "FAILED" ? "CLIENT_EVENT_FAILED" : undefined,
      },
    });
  }
}

export async function grantRewardedCredits(input: {
  userId: string;
  sessionId: string;
  requestNonce: string;
  providerPayload?: unknown;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const session = await prisma.rewardedAdSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session || session.userId !== input.userId) {
    throw new RewardedAdSessionError("REWARDED_SESSION_NOT_FOUND", "Rewarded ad session not found");
  }
  if (session.expiresAt <= now) {
    await prisma.rewardedAdSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    throw new RewardedAdSessionError("REWARDED_SESSION_EXPIRED", "Rewarded ad session expired");
  }
  if (session.status === "GRANTED") {
    return grantRewardedCreditsToWallet({
      userId: input.userId,
      sessionId: session.id,
      platform: session.platform,
      now,
    });
  }
  if (session.requestNonceHash !== hashNonce(input.requestNonce)) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_INVALID_NONCE",
      "Rewarded ad session nonce is invalid",
    );
  }

  if (session.status !== "REWARDED") {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_NOT_REWARDED",
      "Rewarded ad session has no rewarded callback",
    );
  }

  const result = await grantRewardedCreditsToWallet({
    userId: input.userId,
    sessionId: session.id,
    platform: session.platform,
    now,
  });

  await prisma.rewardedAdSession.update({
    where: { id: session.id },
    data: {
      status: "GRANTED",
      providerPayload: input.providerPayload as Prisma.InputJsonValue | undefined,
      rewardedAt: session.rewardedAt ?? now,
      grantedAt: now,
    },
  });

  return result;
}
