import type { GafusSettingsConfig } from "./types";
import { getGafusSettings } from "./settingsService";

/** Query-side DB port. All operations must enforce the authenticated owner
 * scope on the server; this pure Core aggregator never opens Prisma/Redis.
 */
export interface GafusStatusReadPorts {
  readSettingsRow(): Promise<GafusSettingsConfig | null>;
  readBalance(ownerId: string): Promise<number>;
  readGrantedActivity(
    ownerId: string,
    cutoffExclusive: Date,
    nowInclusive: Date,
  ): Promise<{ amount: number; occurredAt: Date }[]>;
}

export async function getGafusStatus(
  userId: string,
  ports: GafusStatusReadPorts,
  now = new Date(),
) {
  const settings = await getGafusSettings(ports.readSettingsRow);
  const cutoff = new Date(now.getTime() - settings.activityWindowSeconds * 1000);
  const [balance, activityGrants] = await Promise.all([
    ports.readBalance(userId),
    ports.readGrantedActivity(userId, cutoff, now),
  ]);
  const earned = activityGrants.reduce((sum, event) => sum + event.amount, 0);
  const remaining = Math.max(0, settings.activityLimit - earned);
  const earliest =
    remaining === 0 && activityGrants.length > 0 ? activityGrants[0]?.occurredAt : null;
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
