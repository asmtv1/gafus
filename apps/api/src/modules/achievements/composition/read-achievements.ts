/** AG1-001: lazy binding to the sole existing achievements Core READ getters. */
import {
  getAchievementStats,
  getUserTrainingDates,
} from "@gafus/achievements-server";
import { createReadAchievementsApplication } from "../application/read-achievements.js";

export const readAchievementsApplication = createReadAchievementsApplication({
  readStats: (actorUserId) => getAchievementStats(actorUserId),
  readTrainingDates: (actorUserId) => getUserTrainingDates(actorUserId),
});
