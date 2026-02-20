/**
 * Fixture для тестов достижений
 */
import type { AchievementStats } from "../../services/achievements/calculateAchievements";

export function createAchievementStatsFixture(
  overrides?: Partial<AchievementStats>,
): AchievementStats {
  return {
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    totalCompletedDays: 0,
    totalDays: 0,
    overallProgress: 0,
    totalTrainingTime: 0,
    averageCourseProgress: 0,
    longestStreak: 0,
    currentStreak: 0,
    ...overrides,
  };
}
