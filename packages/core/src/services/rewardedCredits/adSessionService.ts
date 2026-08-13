import { createHash, randomBytes } from "node:crypto";

import { prisma, type Prisma, type RewardedAdSessionStatus } from "@gafus/prisma";

import { REWARDED_AD_SESSION_TTL_MINUTES } from "./constants";
import { RewardedAdSessionError, RewardedAdsDisabledError } from "./errors";
import { resolveRewardedPlatformSettings } from "./settingsService";
import type { ClientAppContext } from "../appFeatureFlags";
import type { RewardedAdLifecycleEvent, RewardedAdSessionDto, RewardedPlatform } from "./types";

export const REWARDED_ACCESS_DURATION_DAYS = 7;
const REWARDED_ACCESS_DURATION_MS = REWARDED_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type RewardedAccessTargetType = "ARTICLE" | "COURSE_STEP";
export type RewardedAccessTarget = {
  targetType: RewardedAccessTargetType;
  targetId: string;
};

export type RewardedAdStatusDto = {
  settings: { platformEnabled: boolean; testMode: boolean };
  canWatchAd: boolean;
  canWatchAdReason: "OK" | "PLATFORM_DISABLED" | "TARGET_ALREADY_ACTIVE";
  target: RewardedAccessTarget & { unlocked: boolean; expiresAt: string | null };
};

export type RewardedAccessGrantResultDto = RewardedAccessTarget & {
  accessId: string;
  expiresAt: string;
  replay: boolean;
};

// Before the ad is actually shown, the client can safely abandon and replace a
// session (for example after an SDK init or load failure). Preserve this exact
// behavior: only a displayed ad or an already received reward blocks another
// concurrent session for the same target.
const BLOCKING_SESSION_STATUSES = ["SHOWN", "REWARDED"] as const;
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

async function assertTargetExists(target: RewardedAccessTarget): Promise<void> {
  if (target.targetType === "ARTICLE") {
    const article = await prisma.article.findFirst({
      where: { id: target.targetId, visibility: "PUBLIC" },
      select: { id: true },
    });
    if (article) return;
  } else {
    const stepLink = await prisma.stepOnDay.findFirst({
      where: {
        id: target.targetId,
        day: {
          dayLinks: {
            some: { course: { isPaid: false, isPrivate: false } },
          },
        },
      },
      select: { id: true },
    });
    if (stepLink) return;
  }
  throw new RewardedAdSessionError(
    "REWARDED_TARGET_NOT_FOUND",
    "Материал для rewarded-доступа не найден",
  );
}

async function findActiveTargetAccess(input: {
  userId: string;
  target: RewardedAccessTarget;
  now: Date;
}) {
  // platform is the source of the grant for audit. An entitlement follows the
  // account between Android and iOS, but is never accepted by web access checks.
  return prisma.rewardedTargetAccess.findFirst({
    where: {
      userId: input.userId,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      expiresAt: { gt: input.now },
    },
    orderBy: { expiresAt: "desc" },
  });
}

export async function getRewardedAdStatus(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedAccessTarget;
  clientContext?: ClientAppContext;
  now?: Date;
}): Promise<RewardedAdStatusDto> {
  const now = input.now ?? new Date();
  const [platformSettings, access] = await Promise.all([
    resolveRewardedPlatformSettings(input.platform, input.clientContext),
    findActiveTargetAccess({ userId: input.userId, target: input.target, now }),
  ]);
  const canWatchAdReason: RewardedAdStatusDto["canWatchAdReason"] =
    !platformSettings.platformEnabled
      ? "PLATFORM_DISABLED"
      : access
        ? "TARGET_ALREADY_ACTIVE"
        : "OK";

  return {
    settings: {
      platformEnabled: platformSettings.platformEnabled,
      testMode: platformSettings.testMode,
    },
    canWatchAd: canWatchAdReason === "OK",
    canWatchAdReason,
    target: {
      ...input.target,
      unlocked: Boolean(access),
      expiresAt: access?.expiresAt.toISOString() ?? null,
    },
  };
}

export async function createRewardedAdSession(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedAccessTarget;
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

  await assertTargetExists(input.target);
  const activeAccess = await findActiveTargetAccess({
    userId: input.userId,
    target: input.target,
    now,
  });
  if (activeAccess) {
    throw new RewardedAdSessionError("TARGET_ALREADY_ACTIVE", "Материал уже открыт по рекламе");
  }

  const existing = await prisma.rewardedAdSession.findFirst({
    where: {
      userId: input.userId,
      platform: input.platform,
      status: { in: [...BLOCKING_SESSION_STATUSES] },
      expiresAt: { gt: now },
      targetType: input.target.targetType,
      targetId: input.target.targetId,
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
      targetType: input.target.targetType,
      targetId: input.target.targetId,
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
  if (input.eventType === "REWARDED" && session.status === "DISMISSED") {
    const shownEvent = await prisma.rewardedAdEvent.findFirst({
      where: { sessionId: session.id, eventType: "SHOWN" },
      select: { id: true },
    });
    if (!shownEvent) assertValidLifecycleTransition(session.status, input.eventType);
  } else {
    assertValidLifecycleTransition(session.status, input.eventType);
  }

  await prisma.rewardedAdEvent.create({
    data: {
      sessionId: input.sessionId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });

  const nextStatus = mapEventToStatus(input.eventType);
  if (input.eventType === "REWARDED") {
    await prisma.rewardedAdSession.update({
      where: { id: input.sessionId },
      data: { status: "REWARDED", rewardedAt: new Date() },
    });
  } else if (shouldMoveStatusForward(session.status, nextStatus)) {
    // DISMISSED/FAILED can race with REWARDED. Only apply the terminal
    // callback if the session still has the state observed above and no
    // reward has been accepted in the meantime.
    await prisma.rewardedAdSession.updateMany({
      where: { id: input.sessionId, status: session.status, rewardedAt: null },
      data: {
        status: nextStatus,
        errorCode: input.eventType === "FAILED" ? "CLIENT_EVENT_FAILED" : undefined,
      },
    });
  }
}

export async function grantRewardedTargetAccess(input: {
  userId: string;
  sessionId: string;
  requestNonce: string;
  providerPayload?: unknown;
  now?: Date;
}): Promise<RewardedAccessGrantResultDto> {
  const now = input.now ?? new Date();
  const session = await prisma.rewardedAdSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session || session.userId !== input.userId) {
    throw new RewardedAdSessionError("REWARDED_SESSION_NOT_FOUND", "Rewarded ad session not found");
  }
  if (
    !session.targetType ||
    !session.targetId ||
    session.targetType === "DAILY_COURSE_STEP" ||
    session.targetType === "CONSULTATION_BOOKING"
  ) {
    throw new RewardedAdSessionError("REWARDED_TARGET_NOT_FOUND", "Rewarded target is invalid");
  }
  const target: RewardedAccessTarget = {
    targetType: session.targetType,
    targetId: session.targetId,
  };

  const existingGrant = await prisma.rewardedTargetAccess.findUnique({
    where: { sessionId: session.id },
  });
  if (existingGrant) {
    return {
      accessId: existingGrant.id,
      ...target,
      expiresAt: existingGrant.expiresAt.toISOString(),
      replay: true,
    };
  }
  if (session.expiresAt <= now) {
    await prisma.rewardedAdSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    throw new RewardedAdSessionError("REWARDED_SESSION_EXPIRED", "Rewarded ad session expired");
  }
  if (session.requestNonceHash !== hashNonce(input.requestNonce)) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_INVALID_NONCE",
      "Rewarded ad session nonce is invalid",
    );
  }
  // rewardedAt is the immutable proof that the server accepted the reward.
  // A terminal SDK callback may race with REWARDED and must not invalidate it.
  if (!session.rewardedAt) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_NOT_REWARDED",
      "Rewarded ad session has no rewarded callback",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `rewarded-access:${input.userId}:${target.targetType}:${target.targetId}`,
    );
    const replay = await tx.rewardedTargetAccess.findUnique({
      where: { sessionId: session.id },
    });
    if (replay) {
      return {
        accessId: replay.id,
        ...target,
        expiresAt: replay.expiresAt.toISOString(),
        replay: true,
      };
    }

    const activeAccess = await tx.rewardedTargetAccess.findFirst({
      where: {
        userId: input.userId,
        targetType: target.targetType,
        targetId: target.targetId,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });
    if (activeAccess) {
      await tx.rewardedAdSession.update({
        where: { id: session.id },
        data: {
          status: "GRANTED",
          providerPayload: input.providerPayload as Prisma.InputJsonValue | undefined,
          rewardedAt: session.rewardedAt ?? now,
          grantedAt: now,
        },
      });
      return {
        accessId: activeAccess.id,
        ...target,
        expiresAt: activeAccess.expiresAt.toISOString(),
        replay: true,
      };
    }

    const expiresAt = new Date(now.getTime() + REWARDED_ACCESS_DURATION_MS);
    const access = await tx.rewardedTargetAccess.create({
      data: {
        userId: input.userId,
        targetType: target.targetType,
        targetId: target.targetId,
        source: "REWARDED_AD",
        platform: session.platform,
        sessionId: session.id,
        grantedAt: now,
        expiresAt,
      },
    });
    await tx.rewardedAdSession.update({
      where: { id: session.id },
      data: {
        status: "GRANTED",
        providerPayload: input.providerPayload as Prisma.InputJsonValue | undefined,
        rewardedAt: session.rewardedAt ?? now,
        grantedAt: now,
      },
    });

    return {
      accessId: access.id,
      ...target,
      expiresAt: access.expiresAt.toISOString(),
      replay: false,
    };
  });
}
