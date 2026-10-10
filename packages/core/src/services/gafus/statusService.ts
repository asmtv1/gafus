import { prisma } from "@gafus/prisma";
import { getGafusSettings } from "./settingsService";
import { getGafusBalance } from "./walletService";

export async function getGafusStatus(userId: string, now = new Date()) {
  const settings = await getGafusSettings();
  const cutoff = new Date(now.getTime() - settings.activityWindowSeconds * 1000);
  const [balance, activityGrants] = await Promise.all([
    getGafusBalance(userId),
    prisma.gafusRewardEvent.findMany({
      where: {
        userId,
        rewardClass: "ACTIVITY",
        decision: "GRANTED",
        occurredAt: { gt: cutoff, lte: now },
      },
      select: { amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    }),
  ]);
  const earned = activityGrants.reduce((sum, event) => sum + event.amount, 0);
  const remaining = Math.max(0, settings.activityLimit - earned);
  const earliest = remaining === 0 && activityGrants.length > 0
    ? activityGrants[0]?.occurredAt : null;
  return {
    serverNow: now.toISOString(),
    wallet: { balance },
    activity: {
      earned,
      limit: settings.activityLimit,
      windowSeconds: settings.activityWindowSeconds,
      remaining,
      nextCapacityAt: earliest
        ? new Date(earliest.getTime() + settings.activityWindowSeconds * 1000).toISOString()
        : null,
    },
    rules: {
      postReward: settings.postReward,
      questionReward: settings.questionReward,
      answerReward: settings.answerReward,
      reactionThreshold: settings.reactionThreshold,
      reactionReward: settings.reactionReward,
      bestAnswerReward: settings.bestAnswerReward,
      courseStepCost: settings.courseStepCost,
      miniGuideCost: settings.miniGuideCost,
      accessDurationSeconds: settings.accessDurationSeconds,
    },
    enabled: {
      economy: settings.economyEnabled,
      earning: settings.earningEnabled,
      spending: settings.spendingEnabled,
    },
    settingsRevision: settings.revision,
  };
}
