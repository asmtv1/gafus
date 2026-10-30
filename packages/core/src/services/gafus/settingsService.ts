import { prisma } from "@gafus/prisma";
import type { GafusSettingsConfig, GafusTx } from "./types";

export const DEFAULT_GAFUS_SETTINGS: Readonly<GafusSettingsConfig> = Object.freeze({
  revision: 1,
  economyEnabled: true,
  earningEnabled: true,
  spendingEnabled: true,
  postReward: 1,
  questionReward: 1,
  answerReward: 1,
  activityLimit: 3,
  activityWindowSeconds: 86400,
  reactionThreshold: 10,
  reactionReward: 1,
  bestAnswerReward: 1,
  courseStepCost: 1,
  miniGuideCost: 1,
  accessDurationSeconds: 604800,
});

export async function getGafusSettingsTx(tx: GafusTx): Promise<GafusSettingsConfig> {
  const row = await tx.gafusSettings.findUnique({ where: { key: "default" } });
  if (!row) {
    // No admin-configured row yet: all three economy switches are enabled by default.
    return { ...DEFAULT_GAFUS_SETTINGS };
  }
  return {
    revision: row.revision,
    economyEnabled: row.economyEnabled,
    earningEnabled: row.earningEnabled,
    spendingEnabled: row.spendingEnabled,
    postReward: row.postReward,
    questionReward: row.questionReward,
    answerReward: row.answerReward,
    activityLimit: row.activityLimit,
    activityWindowSeconds: row.activityWindowSeconds,
    reactionThreshold: row.reactionThreshold,
    reactionReward: row.reactionReward,
    bestAnswerReward: row.bestAnswerReward,
    // Agreed product economics are not mutable tariff knobs: one Gafus,
    // seven calendar-day equivalents (168 hours), for every content target.
    courseStepCost: DEFAULT_GAFUS_SETTINGS.courseStepCost,
    miniGuideCost: DEFAULT_GAFUS_SETTINGS.miniGuideCost,
    accessDurationSeconds: DEFAULT_GAFUS_SETTINGS.accessDurationSeconds,
  };
}

export async function getGafusSettings(): Promise<GafusSettingsConfig> {
  return getGafusSettingsTx(prisma);
}
