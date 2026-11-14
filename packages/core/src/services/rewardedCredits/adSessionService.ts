import { createHash, randomBytes } from "node:crypto";

import {
  countRewardedDayRows,
  existsPublicRewardedArticle,
  existsPublicRewardedStep,
  findActiveRewardedAccess,
  findBlockingAdSession,
  createAdSessionRow,
  findRewardedAdSessionRow,
  withRewardedDailyLock,
  readShownRewardedEvent,
  readDailyRewardedSettings,
  appendRewardedAdEvent,
  markAdSessionRewarded,
  markAdSessionNonRewardedStatus,
  findRewardedGrantBySession,
  markAdSessionExpired,
  withRewardedAccessLock,
  createRewardedAccessGrant,
  markAdSessionGranted,
  type AdSessionTx,
  type RewardedAdSessionStatus,
} from "./rewardedAdRowsPort";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { REWARDED_AD_SESSION_TTL_MINUTES, REWARDED_DAILY_LIMIT_TIMEZONE } from "./constants";
import {
  RewardedAdSessionError,
  RewardedAdsDisabledError,
  RewardedDailyLimitReachedError,
} from "./errors";
import { resolveRewardedPlatformSettings } from "./settingsService";
import type { ClientAppContext } from "../appFeatureFlags";
import type { RewardedAdLifecycleEvent, RewardedAdSessionDto, RewardedPlatform } from "./types";

export const REWARDED_ACCESS_DURATION_DAYS = 7;
const REWARDED_ACCESS_DURATION_MS = REWARDED_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Enable only after the Gafus app release has reached users. */
const legacyRewardedAdSessionsDisabled = () =>
  process.env.GAFUS_LEGACY_REWARDED_DISABLED === "true";

export type RewardedAccessTargetType = "ARTICLE" | "COURSE_STEP";
export type RewardedAccessTarget = {
  targetType: RewardedAccessTargetType;
  targetId: string;
};

export type RewardedAdStatusDto = {
  settings: { platformEnabled: boolean; testMode: boolean };
  canWatchAd: boolean;
  canWatchAdReason: "OK" | "PLATFORM_DISABLED" | "TARGET_ALREADY_ACTIVE" | "DAILY_LIMIT_REACHED";
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

function getMoscowDayRange(now: Date): { start: Date; end: Date } {
  const zonedNow = toZonedTime(now, REWARDED_DAILY_LIMIT_TIMEZONE);
  const startInMoscow = new Date(zonedNow);
  startInMoscow.setHours(0, 0, 0, 0);
  const endInMoscow = new Date(startInMoscow);
  endInMoscow.setDate(endInMoscow.getDate() + 1);
  return {
    start: fromZonedTime(startInMoscow, REWARDED_DAILY_LIMIT_TIMEZONE),
    end: fromZonedTime(endInMoscow, REWARDED_DAILY_LIMIT_TIMEZONE),
  };
}

async function countRewardsForMoscowDay(
  client: AdSessionTx | undefined,
  userId: string,
  now: Date,
): Promise<number> {
  const { start, end } = getMoscowDayRange(now);
  return countRewardedDayRows(userId, start, end, client);
}

async function assertTargetExists(target: RewardedAccessTarget): Promise<void> {
  if (target.targetType === "ARTICLE") {
    const article = await existsPublicRewardedArticle(target.targetId);
    if (article) return;
  } else {
    const stepLink = await existsPublicRewardedStep(target.targetId);
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
  return findActiveRewardedAccess(input.userId, input.target, input.now);
}

export async function getRewardedAdStatus(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedAccessTarget;
  clientContext?: ClientAppContext;
  now?: Date;
}): Promise<RewardedAdStatusDto> {
  const now = input.now ?? new Date();
  const [platformSettings, access, rewardsToday] = await Promise.all([
    resolveRewardedPlatformSettings(input.platform, input.clientContext),
    findActiveTargetAccess({ userId: input.userId, target: input.target, now }),
    countRewardsForMoscowDay(undefined, input.userId, now),
  ]);
  const canWatchAdReason: RewardedAdStatusDto["canWatchAdReason"] =
    legacyRewardedAdSessionsDisabled() || !platformSettings.platformEnabled
      ? "PLATFORM_DISABLED"
      : access
        ? "TARGET_ALREADY_ACTIVE"
        : rewardsToday >= platformSettings.dailyAdLimit
          ? "DAILY_LIMIT_REACHED"
          : "OK";

  return {
    settings: {
      platformEnabled: platformSettings.platformEnabled && !legacyRewardedAdSessionsDisabled(),
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
  // Existing sessions can still finish; no new ones after cutover.
  if (legacyRewardedAdSessionsDisabled()) throw new RewardedAdsDisabledError();
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

  const rewardsToday = await countRewardsForMoscowDay(undefined, input.userId, now);
  if (rewardsToday >= platformSettings.dailyAdLimit) {
    throw new RewardedDailyLimitReachedError();
  }

  const existing = await findBlockingAdSession(
    input.userId,
    input.platform,
    input.target,
    BLOCKING_SESSION_STATUSES,
    now,
  );
  if (existing) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_ALREADY_GRANTED",
      "У пользователя уже есть активная rewarded ad session",
    );
  }

  const requestNonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + REWARDED_AD_SESSION_TTL_MINUTES * 60 * 1000);
  const session = await createAdSessionRow({
    userId: input.userId,
    platform: input.platform,
    placementId: platformSettings.placementId,
    requestNonceHash: hashNonce(requestNonce),
    expiresAt,
    target: input.target,
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
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  if (input.eventType === "REWARDED") {
    await withRewardedDailyLock(input.userId, async (tx) => {
      const session = await findRewardedAdSessionRow(input.sessionId, tx);
      if (!session || session.userId !== input.userId) {
        throw new RewardedAdSessionError(
          "REWARDED_SESSION_NOT_FOUND",
          "Rewarded ad session not found",
        );
      }

      // Provider/client retries are successful no-ops and never spend another slot.
      if (session.rewardedAt || session.status === "REWARDED" || session.status === "GRANTED") {
        return;
      }
      if (session.status === "DISMISSED") {
        const shownEvent = await readShownRewardedEvent(tx, session.id);
        if (!shownEvent) {
          assertValidLifecycleTransition(session.status, input.eventType);
        }
      } else {
        assertValidLifecycleTransition(session.status, input.eventType);
      }

      const settings = await readDailyRewardedSettings(tx);
      const dailyAdLimit = settings?.dailyAdLimit ?? 1;
      const rewardsToday = await countRewardsForMoscowDay(tx, input.userId, now);
      if (rewardsToday >= dailyAdLimit) {
        throw new RewardedDailyLimitReachedError();
      }

      await appendRewardedAdEvent(
        { sessionId: input.sessionId, eventType: input.eventType, payload: input.payload },
        tx,
      );
      await markAdSessionRewarded(tx, input.sessionId, now);
    });
    return;
  }

  const session = await findRewardedAdSessionRow(input.sessionId);
  if (!session || session.userId !== input.userId) {
    throw new RewardedAdSessionError("REWARDED_SESSION_NOT_FOUND", "Rewarded ad session not found");
  }
  assertValidLifecycleTransition(session.status, input.eventType);

  await appendRewardedAdEvent({
    sessionId: input.sessionId,
    eventType: input.eventType,
    payload: input.payload,
  });

  const nextStatus = mapEventToStatus(input.eventType);
  if (shouldMoveStatusForward(session.status, nextStatus)) {
    // A late DISMISSED/FAILED request must not overwrite a concurrently accepted reward.
    await markAdSessionNonRewardedStatus(
      input.sessionId,
      session.status,
      nextStatus,
      input.eventType === "FAILED",
    );
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
  const session = await findRewardedAdSessionRow(input.sessionId);
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

  const existingGrant = await findRewardedGrantBySession(session.id);
  if (existingGrant) {
    return {
      accessId: existingGrant.id,
      ...target,
      expiresAt: existingGrant.expiresAt.toISOString(),
      replay: true,
    };
  }
  if (session.expiresAt <= now) {
    await markAdSessionExpired(session.id);
    throw new RewardedAdSessionError("REWARDED_SESSION_EXPIRED", "Rewarded ad session expired");
  }
  if (session.requestNonceHash !== hashNonce(input.requestNonce)) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_INVALID_NONCE",
      "Rewarded ad session nonce is invalid",
    );
  }
  // rewardedAt is the immutable proof that the server accepted the reward.
  // Lifecycle callbacks such as DISMISSED can race with REWARDED and must not
  // make an already accepted reward impossible to grant or replay.
  if (!session.rewardedAt) {
    throw new RewardedAdSessionError(
      "REWARDED_SESSION_NOT_REWARDED",
      "Rewarded ad session has no rewarded callback",
    );
  }

  return withRewardedAccessLock(input.userId, target, async (tx) => {
    const replay = await findRewardedGrantBySession(session.id, tx);
    if (replay) {
      return {
        accessId: replay.id,
        ...target,
        expiresAt: replay.expiresAt.toISOString(),
        replay: true,
      };
    }

    const activeAccess = await findActiveRewardedAccess(input.userId, target, now, tx);
    if (activeAccess) {
      await markAdSessionGranted(tx, {
        sessionId: session.id,
        providerPayload: input.providerPayload,
        rewardedAt: session.rewardedAt ?? now,
        grantedAt: now,
      });
      return {
        accessId: activeAccess.id,
        ...target,
        expiresAt: activeAccess.expiresAt.toISOString(),
        replay: true,
      };
    }

    const expiresAt = new Date(now.getTime() + REWARDED_ACCESS_DURATION_MS);
    const access = await createRewardedAccessGrant(tx, {
      userId: input.userId,
      target,
      platform: session.platform,
      sessionId: session.id,
      now,
      expiresAt,
    });
    await markAdSessionGranted(tx, {
      sessionId: session.id,
      providerPayload: input.providerPayload,
      rewardedAt: session.rewardedAt ?? now,
      grantedAt: now,
    });

    return {
      accessId: access.id,
      ...target,
      expiresAt: access.expiresAt.toISOString(),
      replay: false,
    };
  });
}
