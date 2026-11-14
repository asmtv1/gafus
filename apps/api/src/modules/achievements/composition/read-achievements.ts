import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001: lazy binding to the sole existing achievements Core READ getters. */
import {
  getAchievementStats,
  getUserTrainingDates,
} from "@gafus/achievements-server";
import { createReadAchievementsApplication } from "../application/read-achievements.js";

export const readAchievementsApplication = createReadAchievementsApplication({
  readStats: (actorUserId) => withCorrelatedUseCase("achievements.stats.read", () => getAchievementStats(actorUserId)),
  readTrainingDates: (actorUserId) => withCorrelatedUseCase("achievements.training_dates.read", () => getUserTrainingDates(actorUserId)),
});
