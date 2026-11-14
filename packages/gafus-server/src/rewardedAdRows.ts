/**
 * PostgreSQL persistence port for rewarded-ad sessions and access.
 * Core owns lifecycle transition legality, entitlement policy, daily cap,
 * signed event/nonce validation and DTOs.
 * All replay-sensitive operations retain their original caller transaction.
 */
import { Prisma, prisma, type RewardedAdSessionStatus } from "@gafus/prisma";
export type { RewardedAdSessionStatus } from "@gafus/prisma";
export type AdSessionTx = Prisma.TransactionClient;
type AccessTarget = {
  targetType: "ARTICLE" | "COURSE_STEP";
  targetId: string;
};
type Platform = "IOS" | "ANDROID";
export function countRewardedDayRows(userId: string, start: Date, end: Date, tx?: AdSessionTx) {
  return (tx ?? prisma).rewardedAdSession.count({
    where: { userId, rewardedAt: { gte: start, lt: end } },
  });
}
export async function existsPublicRewardedArticle(targetId: string): Promise<boolean> {
  return Boolean(
    await prisma.article.findFirst({
      where: { id: targetId, visibility: "PUBLIC" },
      select: { id: true },
    }),
  );
}
export async function existsPublicRewardedStep(targetId: string): Promise<boolean> {
  return Boolean(
    await prisma.stepOnDay.findFirst({
      where: {
        id: targetId,
        day: { dayLinks: { some: { course: { isPaid: false, isPrivate: false } } } },
      },
      select: { id: true },
    }),
  );
}
export function findActiveRewardedAccess(
  userId: string,
  target: AccessTarget,
  now: Date,
  tx?: AdSessionTx,
) {
  return (tx ?? prisma).rewardedTargetAccess.findFirst({
    where: {
      userId,
      targetType: target.targetType,
      targetId: target.targetId,
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: "desc" },
  });
}
export function findBlockingAdSession(
  userId: string,
  platform: Platform,
  target: AccessTarget,
  statuses: readonly RewardedAdSessionStatus[],
  now: Date,
) {
  return prisma.rewardedAdSession.findFirst({
    where: {
      userId,
      platform,
      status: { in: [...statuses] },
      expiresAt: { gt: now },
      targetType: target.targetType,
      targetId: target.targetId,
    },
  });
}
export function createAdSessionRow(input: {
  userId: string;
  platform: Platform;
  placementId: string;
  requestNonceHash: string;
  expiresAt: Date;
  target: AccessTarget;
}) {
  return prisma.rewardedAdSession.create({
    data: {
      userId: input.userId,
      platform: input.platform,
      provider: "YANDEX",
      placementId: input.placementId,
      requestNonceHash: input.requestNonceHash,
      expiresAt: input.expiresAt,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
    },
  });
}
export function findRewardedAdSessionRow(sessionId: string, tx?: AdSessionTx) {
  return (tx ?? prisma).rewardedAdSession.findUnique({ where: { id: sessionId } });
}
export function withRewardedDailyLock<T>(
  userId: string,
  callback: (tx: AdSessionTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `rewarded-daily-limit:${userId}`,
    );
    return callback(tx);
  });
}
export function readShownRewardedEvent(tx: AdSessionTx, sessionId: string) {
  return tx.rewardedAdEvent.findFirst({
    where: { sessionId, eventType: "SHOWN" },
    select: { id: true },
  });
}
export function readDailyRewardedSettings(tx: AdSessionTx) {
  return tx.rewardedAdSettings.findUnique({
    where: { key: "default" },
    select: { dailyAdLimit: true },
  });
}
export function appendRewardedAdEvent(
  input: {
    sessionId: string;
    eventType: string;
    payload?: unknown;
  },
  tx?: AdSessionTx,
) {
  return (tx ?? prisma).rewardedAdEvent.create({
    data: {
      sessionId: input.sessionId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });
}
export function markAdSessionRewarded(tx: AdSessionTx, sessionId: string, now: Date) {
  return tx.rewardedAdSession.update({
    where: { id: sessionId },
    data: { status: "REWARDED", rewardedAt: now },
  });
}
export function markAdSessionNonRewardedStatus(
  sessionId: string,
  previousStatus: RewardedAdSessionStatus,
  status: RewardedAdSessionStatus,
  failed: boolean,
) {
  return prisma.rewardedAdSession.updateMany({
    where: { id: sessionId, status: previousStatus, rewardedAt: null },
    data: { status: status, errorCode: failed ? "CLIENT_EVENT_FAILED" : undefined },
  });
}
export function findRewardedGrantBySession(sessionId: string, tx?: AdSessionTx) {
  return (tx ?? prisma).rewardedTargetAccess.findUnique({ where: { sessionId } });
}
export function markAdSessionExpired(sessionId: string) {
  return prisma.rewardedAdSession.update({ where: { id: sessionId }, data: { status: "EXPIRED" } });
}
export function withRewardedAccessLock<T>(
  userId: string,
  target: AccessTarget,
  callback: (tx: AdSessionTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `rewarded-access:${userId}:${target.targetType}:${target.targetId}`,
    );
    return callback(tx);
  });
}
export function createRewardedAccessGrant(
  tx: AdSessionTx,
  input: {
    userId: string;
    target: AccessTarget;
    platform: Platform;
    sessionId: string;
    now: Date;
    expiresAt: Date;
  },
) {
  return tx.rewardedTargetAccess.create({
    data: {
      userId: input.userId,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      source: "REWARDED_AD",
      platform: input.platform,
      sessionId: input.sessionId,
      grantedAt: input.now,
      expiresAt: input.expiresAt,
    },
  });
}
export function markAdSessionGranted(
  tx: AdSessionTx,
  input: {
    sessionId: string;
    providerPayload?: unknown;
    rewardedAt: Date;
    grantedAt: Date;
  },
) {
  return tx.rewardedAdSession.update({
    where: { id: input.sessionId },
    data: {
      status: "GRANTED",
      providerPayload: input.providerPayload as Prisma.InputJsonValue | undefined,
      rewardedAt: input.rewardedAt,
      grantedAt: input.grantedAt,
    },
  });
}
